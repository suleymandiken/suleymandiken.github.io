"""GridPost Mini — fotoğrafı Instagram profil ızgarası için parçalara böler.

Mantık (AppX Studio'nun Grid Post uygulamasındaki gibi):
  1. Fotoğrafı aç.
  2. Izgara düzenini (sütun x satır) ve parça oranını seç.
  3. Önizlemede sürükleyerek kadrajı kaydır, tekerlekle yakınlaştır.
  4. Dışa aktar: parçalar paylaşım sırasına göre numaralanır
     (01 = ilk paylaşılacak = sağ alt köşe).

Çalıştırmak için: pip install pillow  →  python gridpost.py
"""

import os
import tkinter as tk
from tkinter import filedialog, messagebox, ttk

from PIL import Image, ImageOps, ImageTk

# Instagram gönderi genişliği; yükseklik parça oranından gelir.
TILE_WIDTH = 1080

LAYOUTS = {
    "3 x 1  (yatay şerit)": (3, 1),
    "3 x 2": (3, 2),
    "3 x 3": (3, 3),
    "3 x 4": (3, 4),
    "2 x 1": (2, 1),
    "2 x 2": (2, 2),
}

# parça genişlik:yükseklik oranı
RATIOS = {
    "3:4  (yeni profil ızgarası)": (3, 4),
    "4:5  (dikey gönderi)": (4, 5),
    "1:1  (kare)": (1, 1),
}

BG = "#16161a"
PANEL = "#202027"
ACCENT = "#ff4f7b"
TEXT = "#e8e8ee"
MUTED = "#8a8a99"


class GridPostApp:
    def __init__(self, root):
        self.root = root
        root.title("GridPost Mini")
        root.geometry("1000x700")
        root.minsize(760, 520)
        root.configure(bg=BG)

        self.image = None          # orijinal PIL görüntüsü
        self.path = None
        self.zoom = 1.0            # 1 = mümkün olan en büyük kadraj
        self.cx = self.cy = 0.0    # kadraj merkezi (orijinal piksel)
        self.drag_from = None
        self.preview_scale = 1.0
        self.tk_img = None

        self.layout_var = tk.StringVar(value="3 x 3")
        self.ratio_var = tk.StringVar(value=list(RATIOS)[0])
        self.numbers_var = tk.BooleanVar(value=True)

        self._build_ui()
        root.bind("<Control-o>", lambda e: self.open_image())
        root.bind("<Control-s>", lambda e: self.export())

    # ---------- arayüz ----------
    def _build_ui(self):
        style = ttk.Style()
        style.theme_use("clam")
        style.configure("TCombobox", fieldbackground=PANEL, background=PANEL,
                        foreground=TEXT, arrowcolor=TEXT)

        side = tk.Frame(self.root, bg=PANEL, width=250)
        side.pack(side="left", fill="y")
        side.pack_propagate(False)

        tk.Label(side, text="GridPost Mini", bg=PANEL, fg=TEXT,
                 font=("Segoe UI", 16, "bold")).pack(anchor="w", padx=18, pady=(18, 2))
        tk.Label(side, text="Instagram ızgara bölücü", bg=PANEL, fg=MUTED,
                 font=("Segoe UI", 9)).pack(anchor="w", padx=18, pady=(0, 16))

        self._button(side, "Fotoğraf aç  (Ctrl+O)", self.open_image).pack(fill="x", padx=18, pady=4)

        self._label(side, "Izgara (sütun x satır)")
        layout = ttk.Combobox(side, textvariable=self.layout_var, values=list(LAYOUTS),
                              state="readonly")
        layout.pack(fill="x", padx=18)
        layout.bind("<<ComboboxSelected>>", lambda e: self.reset_crop())

        self._label(side, "Parça oranı")
        ratio = ttk.Combobox(side, textvariable=self.ratio_var, values=list(RATIOS),
                             state="readonly")
        ratio.pack(fill="x", padx=18)
        ratio.bind("<<ComboboxSelected>>", lambda e: self.reset_crop())

        tk.Checkbutton(side, text="Paylaşım sırasını göster", variable=self.numbers_var,
                       command=self.redraw, bg=PANEL, fg=TEXT, selectcolor=BG,
                       activebackground=PANEL, activeforeground=TEXT,
                       font=("Segoe UI", 9)).pack(anchor="w", padx=14, pady=(14, 0))

        self._button(side, "Kadrajı sıfırla", self.reset_crop, primary=False).pack(
            fill="x", padx=18, pady=(14, 4))
        self._button(side, "Parçaları kaydet  (Ctrl+S)", self.export).pack(
            fill="x", padx=18, pady=4)

        tk.Label(side, justify="left", wraplength=214, bg=PANEL, fg=MUTED,
                 font=("Segoe UI", 9),
                 text="• Sürükle: kadrajı kaydır\n• Tekerlek: yakınlaştır\n\n"
                      "Paylaşırken 01'den başla. Instagram en yeni gönderiyi sol üste "
                      "koyduğu için 01 sağ alt köşedir.").pack(anchor="w", padx=18, pady=16)

        self.status = tk.Label(side, text="Fotoğraf seçilmedi", bg=PANEL, fg=MUTED,
                               font=("Segoe UI", 8), wraplength=214, justify="left")
        self.status.pack(side="bottom", anchor="w", padx=18, pady=14)

        self.canvas = tk.Canvas(self.root, bg=BG, highlightthickness=0, cursor="fleur")
        self.canvas.pack(side="left", fill="both", expand=True)
        self.canvas.bind("<Configure>", lambda e: self.redraw())
        self.canvas.bind("<ButtonPress-1>", self._drag_start)
        self.canvas.bind("<B1-Motion>", self._drag_move)
        self.canvas.bind("<MouseWheel>", self._wheel)                        # Windows
        self.canvas.bind("<Button-4>", lambda e: self._zoom_by(1.1))         # Linux
        self.canvas.bind("<Button-5>", lambda e: self._zoom_by(1 / 1.1))

    def _label(self, parent, text):
        tk.Label(parent, text=text, bg=PANEL, fg=MUTED, font=("Segoe UI", 9)).pack(
            anchor="w", padx=18, pady=(14, 4))

    def _button(self, parent, text, cmd, primary=True):
        return tk.Button(parent, text=text, command=cmd, relief="flat", bd=0,
                         bg=ACCENT if primary else BG, fg="white" if primary else TEXT,
                         activebackground="#e0436b" if primary else "#2a2a33",
                         activeforeground="white", font=("Segoe UI", 10, "bold"),
                         padx=10, pady=8, cursor="hand2")

    # ---------- kadraj hesabı ----------
    def grid(self):
        return LAYOUTS[self.layout_var.get()]

    def target_aspect(self):
        cols, rows = self.grid()
        rw, rh = RATIOS[self.ratio_var.get()]
        return (cols * rw) / (rows * rh)

    def crop_box(self):
        """Orijinal görüntüde kırpılacak dikdörtgen (sol, üst, sağ, alt)."""
        w, h = self.image.size
        a = self.target_aspect()
        if w / h > a:
            cw, ch = h * a, h
        else:
            cw, ch = w, w / a
        cw, ch = cw / self.zoom, ch / self.zoom
        # merkezi görüntü sınırları içinde tut
        self.cx = min(max(self.cx, cw / 2), w - cw / 2)
        self.cy = min(max(self.cy, ch / 2), h - ch / 2)
        return (self.cx - cw / 2, self.cy - ch / 2, self.cx + cw / 2, self.cy + ch / 2)

    def reset_crop(self):
        if not self.image:
            return
        self.zoom = 1.0
        self.cx, self.cy = self.image.width / 2, self.image.height / 2
        self.redraw()

    # ---------- olaylar ----------
    def open_image(self):
        path = filedialog.askopenfilename(
            title="Fotoğraf seç",
            filetypes=[("Görseller", "*.jpg *.jpeg *.png *.webp *.bmp"), ("Tümü", "*.*")])
        if not path:
            return
        try:
            img = ImageOps.exif_transpose(Image.open(path))
        except Exception as exc:
            messagebox.showerror("Açılamadı", f"Bu dosya açılamadı:\n{exc}")
            return
        if img.mode != "RGB":
            bg = Image.new("RGB", img.size, "white")
            bg.paste(img, mask=img.convert("RGBA").getchannel("A"))
            img = bg
        self.image, self.path = img, path
        self.status.config(text=f"{os.path.basename(path)}\n{img.width} x {img.height} px")
        self.reset_crop()

    def _drag_start(self, e):
        self.drag_from = (e.x, e.y)

    def _drag_move(self, e):
        if not self.image or not self.drag_from:
            return
        dx, dy = e.x - self.drag_from[0], e.y - self.drag_from[1]
        self.drag_from = (e.x, e.y)
        # görüntüyü parmakla tutup çekiyormuş gibi: kadraj ters yöne gider
        self.cx -= dx / self.preview_scale
        self.cy -= dy / self.preview_scale
        self.redraw()

    def _wheel(self, e):
        self._zoom_by(1.1 if e.delta > 0 else 1 / 1.1)

    def _zoom_by(self, factor):
        if not self.image:
            return
        self.zoom = min(max(self.zoom * factor, 1.0), 8.0)
        self.redraw()

    # ---------- çizim ----------
    def redraw(self):
        c = self.canvas
        c.delete("all")
        cw, ch = c.winfo_width(), c.winfo_height()
        if not self.image:
            c.create_text(cw / 2, ch / 2, fill=MUTED, font=("Segoe UI", 12),
                          text="Başlamak için bir fotoğraf aç (Ctrl+O)")
            return

        box = self.crop_box()
        bw, bh = box[2] - box[0], box[3] - box[1]
        pad = 30
        scale = min((cw - 2 * pad) / bw, (ch - 2 * pad) / bh)
        self.preview_scale = scale
        pw, ph = max(1, int(bw * scale)), max(1, int(bh * scale))
        preview = self.image.resize((pw, ph), Image.BILINEAR, box=box)
        self.tk_img = ImageTk.PhotoImage(preview)
        x0, y0 = (cw - pw) // 2, (ch - ph) // 2
        c.create_image(x0, y0, anchor="nw", image=self.tk_img)

        cols, rows = self.grid()
        tw, th = pw / cols, ph / rows
        for i in range(1, cols):
            c.create_line(x0 + i * tw, y0, x0 + i * tw, y0 + ph, fill="white", width=2)
        for j in range(1, rows):
            c.create_line(x0, y0 + j * th, x0 + pw, y0 + j * th, fill="white", width=2)
        c.create_rectangle(x0, y0, x0 + pw, y0 + ph, outline="white", width=2)

        if self.numbers_var.get():
            total = cols * rows
            r = max(10, min(tw, th) * 0.12)
            for row in range(rows):
                for col in range(cols):
                    n = total - (row * cols + col)
                    mx, my = x0 + col * tw + tw / 2, y0 + row * th + th / 2
                    c.create_oval(mx - r, my - r, mx + r, my + r, fill=ACCENT, outline="")
                    c.create_text(mx, my, text=f"{n:02d}", fill="white",
                                  font=("Segoe UI", int(r * 0.8), "bold"))

    # ---------- dışa aktarma ----------
    def export(self):
        if not self.image:
            messagebox.showinfo("GridPost Mini", "Önce bir fotoğraf aç.")
            return
        folder = filedialog.askdirectory(title="Parçaların kaydedileceği klasör")
        if not folder:
            return

        cols, rows = self.grid()
        rw, rh = RATIOS[self.ratio_var.get()]
        tile_w, tile_h = TILE_WIDTH, round(TILE_WIDTH * rh / rw)
        full = self.image.resize((cols * tile_w, rows * tile_h), Image.LANCZOS,
                                 box=self.crop_box())

        base = os.path.splitext(os.path.basename(self.path))[0]
        out_dir = os.path.join(folder, f"{base}_grid_{cols}x{rows}")
        os.makedirs(out_dir, exist_ok=True)
        total = cols * rows
        for row in range(rows):
            for col in range(cols):
                n = total - (row * cols + col)
                tile = full.crop((col * tile_w, row * tile_h,
                                  (col + 1) * tile_w, (row + 1) * tile_h))
                tile.save(os.path.join(out_dir, f"{n:02d}.jpg"), "JPEG",
                          quality=95, subsampling=0)

        if messagebox.askyesno("Hazır",
                               f"{total} parça kaydedildi ({tile_w}x{tile_h} px).\n"
                               f"01'den başlayarak sırayla paylaş.\n\nKlasörü açayım mı?"):
            if hasattr(os, "startfile"):
                os.startfile(out_dir)


def main():
    try:  # Windows'ta yüksek DPI ekranlarda bulanıklığı önle (Tk'dan önce olmalı)
        from ctypes import windll
        windll.shcore.SetProcessDpiAwareness(1)
    except Exception:
        pass
    root = tk.Tk()
    GridPostApp(root)
    root.mainloop()


if __name__ == "__main__":
    main()
