#!/usr/bin/env python3
"""
ROTOVIDE — Professional LUT Generator
Generates 33x33x33 .cube LUT files for all color grades.
Run during Docker build to produce /app/luts/*.cube
"""

import os
import math

os.makedirs("/app/luts", exist_ok=True)

SIZE = 33  # 33x33x33 is the standard for professional LUTs

def clamp(x, lo=0.0, hi=1.0):
    return max(lo, min(hi, float(x)))

def luma(r, g, b):
    """Rec 709 luminance"""
    return 0.2126 * r + 0.7152 * g + 0.0722 * b

def sat(r, g, b, saturation):
    """Adjust saturation preserving Rec 709 luminance"""
    y = luma(r, g, b)
    return (
        clamp(y + (r - y) * saturation),
        clamp(y + (g - y) * saturation),
        clamp(y + (b - y) * saturation),
    )

def apply_curve(x, points):
    """Linear interpolation through curve control points [(x,y),...]"""
    x = clamp(x)
    if x <= points[0][0]:  return points[0][1]
    if x >= points[-1][0]: return points[-1][1]
    for i in range(len(points) - 1):
        x0, y0 = points[i]
        x1, y1 = points[i+1]
        if x0 <= x <= x1:
            t = (x - x0) / (x1 - x0)
            return clamp(y0 + t * (y1 - y0))
    return x

def split_tone(r, g, b, shadow, highlight, s_str=0.25, h_str=0.25):
    """Add color cast to shadows and highlights separately"""
    y = luma(r, g, b)
    # Shadow influence peaks at y=0, fades by y=0.5
    s_inf = clamp(1.0 - y * 2.0) ** 1.5 * s_str
    # Highlight influence peaks at y=1, starts at y=0.5
    h_inf = clamp((y - 0.5) * 2.0) ** 1.5 * h_str
    return (
        clamp(r + shadow[0] * s_inf + highlight[0] * h_inf),
        clamp(g + shadow[1] * s_inf + highlight[1] * h_inf),
        clamp(b + shadow[2] * s_inf + highlight[2] * h_inf),
    )

def lift_gamma_gain(r, g, b, lift=(0,0,0), gamma=(1,1,1), gain=(1,1,1)):
    r = clamp((clamp(r) + lift[0]) * gain[0])
    g = clamp((clamp(g) + lift[1]) * gain[1])
    b = clamp((clamp(b) + lift[2]) * gain[2])
    r = clamp(r ** (1.0/gamma[0])) if r > 0 else 0.0
    g = clamp(g ** (1.0/gamma[1])) if g > 0 else 0.0
    b = clamp(b ** (1.0/gamma[2])) if b > 0 else 0.0
    return r, g, b

def write_cube(name, transform_fn):
    path = f"/app/luts/{name}.cube"
    with open(path, "w") as f:
        f.write(f"TITLE \"{name}\"\n")
        f.write(f"LUT_3D_SIZE {SIZE}\n")
        f.write("DOMAIN_MIN 0.0 0.0 0.0\n")
        f.write("DOMAIN_MAX 1.0 1.0 1.0\n\n")
        # CUBE format: B outer loop, G middle, R inner
        for bi in range(SIZE):
            for gi in range(SIZE):
                for ri in range(SIZE):
                    r = ri / (SIZE - 1)
                    g = gi / (SIZE - 1)
                    b = bi / (SIZE - 1)
                    ro, go, bo = transform_fn(r, g, b)
                    f.write(f"{ro:.6f} {go:.6f} {bo:.6f}\n")
    print(f"  ✓ {name}.cube")


# ─────────────────────────────────────────────
# FILM LOOKS
# ─────────────────────────────────────────────

def film_kodak(r, g, b):
    """Kodak 2383 print film — warm, lifted blacks, soft highlight rolloff"""
    # Soft S-curve with highlight rolloff
    curve = [(0,0.02),(0.1,0.11),(0.3,0.30),(0.5,0.50),(0.75,0.73),(1.0,0.96)]
    r = apply_curve(r, curve)
    g = apply_curve(g, curve)
    b = apply_curve(b, curve)
    # Warm push: orange in highlights, slight cyan in shadows
    r, g, b = split_tone(r, g, b,
        shadow=(-0.02, 0.02, 0.04),      # cyan-green shadows
        highlight=(0.05, 0.01, -0.04),   # warm orange highlights
        s_str=0.8, h_str=0.8)
    # Slight desaturation (film grain softens colors)
    r, g, b = sat(r, g, b, 0.88)
    return r, g, b

def film_fuji(r, g, b):
    """Fuji 3510 — cool, punchy, slightly green midtones"""
    # Punchier contrast than Kodak
    curve = [(0,0.01),(0.15,0.14),(0.5,0.51),(0.85,0.88),(1.0,0.97)]
    r = apply_curve(r, curve)
    g = apply_curve(g, curve)
    b = apply_curve(b, curve)
    # Cool green-blue cast
    r, g, b = split_tone(r, g, b,
        shadow=(-0.02, 0.01, 0.05),     # blue shadows
        highlight=(-0.02, 0.02, 0.01),  # green-cool highlights
        s_str=0.7, h_str=0.6)
    r, g, b = sat(r, g, b, 0.92)
    return r, g, b

def film_portra(r, g, b):
    """Kodak Portra 400 — warm, skin-friendly, smooth rolloff"""
    # Smooth highlight compression
    curve = [(0,0.015),(0.2,0.20),(0.5,0.505),(0.8,0.79),(1.0,0.95)]
    r = apply_curve(r, curve)
    g = apply_curve(g, curve)
    b = apply_curve(b, curve)
    # Warm skin tones — gentle push
    r, g, b = split_tone(r, g, b,
        shadow=(0.01, 0.005, -0.01),    # very subtle warm shadows
        highlight=(0.04, 0.01, -0.03),  # warm highlights
        s_str=0.6, h_str=0.7)
    r, g, b = sat(r, g, b, 0.94)
    return r, g, b

def film_expired(r, g, b):
    """Expired film — degraded, faded, cross-processed cast"""
    # Compressed dynamic range (faded)
    curve = [(0,0.06),(0.25,0.22),(0.5,0.48),(0.75,0.72),(1.0,0.88)]
    r = apply_curve(r, curve)
    g = apply_curve(g, curve)
    b = apply_curve(b, curve)
    # Heavy green/magenta cast
    r, g, b = split_tone(r, g, b,
        shadow=(0.04, 0.06, -0.03),   # greenish shadows
        highlight=(0.05, -0.02, 0.04), # magenta-pink highlights
        s_str=1.0, h_str=1.0)
    # Strong desaturation
    r, g, b = sat(r, g, b, 0.55)
    return r, g, b


# ─────────────────────────────────────────────
# CINEMATIC LOOKS
# ─────────────────────────────────────────────

def cinematic_teal_orange(r, g, b):
    """Hollywood teal & orange — the classic blockbuster grade"""
    # Strong contrast S-curve
    curve = [(0,0.0),(0.1,0.07),(0.35,0.32),(0.65,0.68),(0.9,0.93),(1.0,1.0)]
    r = apply_curve(r, curve)
    g = apply_curve(g, curve)
    b = apply_curve(b, curve)
    # Teal shadows + orange highlights (the signature move)
    r, g, b = split_tone(r, g, b,
        shadow=(-0.07, 0.05, 0.09),    # strong teal
        highlight=(0.09, 0.01, -0.07), # strong orange
        s_str=1.0, h_str=1.0)
    # Keep midtones punchy
    r, g, b = sat(r, g, b, 1.05)
    return r, g, b

def cinematic_cool(r, g, b):
    """Cool film noir — blue-grey, desaturated, moody"""
    curve = [(0,0.015),(0.3,0.28),(0.5,0.49),(0.7,0.71),(1.0,0.97)]
    r = apply_curve(r, curve)
    g = apply_curve(g, curve)
    b = apply_curve(b, curve)
    r, g, b = split_tone(r, g, b,
        shadow=(-0.03, -0.01, 0.07),   # blue shadows
        highlight=(-0.02, 0.0, 0.04),  # cool blue highlights
        s_str=0.9, h_str=0.7)
    r, g, b = sat(r, g, b, 0.75)
    return r, g, b

def cinematic_warm(r, g, b):
    """Warm cinematic — amber grade, rich and contrasty"""
    curve = [(0,0.0),(0.1,0.08),(0.5,0.51),(0.9,0.93),(1.0,1.0)]
    r = apply_curve(r, curve)
    g = apply_curve(g, curve)
    b = apply_curve(b, curve)
    r, g, b = split_tone(r, g, b,
        shadow=(0.03, 0.01, -0.02),   # warm shadows
        highlight=(0.06, 0.02, -0.05), # warm amber highlights
        s_str=0.7, h_str=0.8)
    r, g, b = sat(r, g, b, 1.05)
    return r, g, b

def golden_hour(r, g, b):
    """Golden hour — strong warm cast, saturated, magic hour feel"""
    curve = [(0,0.01),(0.4,0.40),(0.7,0.72),(1.0,0.99)]
    r = apply_curve(r, curve)
    g = apply_curve(g, curve)
    b = apply_curve(b, curve)
    r, g, b = split_tone(r, g, b,
        shadow=(0.04, 0.02, -0.03),    # warm gold shadows
        highlight=(0.10, 0.04, -0.08), # strong orange-gold highlights
        s_str=0.8, h_str=1.0)
    r, g, b = sat(r, g, b, 1.15)
    return r, g, b

def midnight_blue(r, g, b):
    """Midnight blue — deep shadows, desaturated, cold night grade"""
    # Crush blacks, lower contrast in shadows
    curve = [(0,0.0),(0.15,0.09),(0.5,0.48),(0.85,0.87),(1.0,0.97)]
    r = apply_curve(r, curve)
    g = apply_curve(g, curve)
    b = apply_curve(b, curve)
    r, g, b = split_tone(r, g, b,
        shadow=(-0.06, -0.02, 0.12),   # deep blue shadows
        highlight=(-0.02, 0.0, 0.05),  # cool blue highlights
        s_str=1.0, h_str=0.6)
    r, g, b = sat(r, g, b, 0.70)
    return r, g, b

def muted_earth(r, g, b):
    """Muted earth — desaturated earthy tones, indie film feel"""
    # Faded, compressed
    curve = [(0,0.04),(0.3,0.28),(0.5,0.47),(0.7,0.67),(1.0,0.92)]
    r = apply_curve(r, curve)
    g = apply_curve(g, curve)
    b = apply_curve(b, curve)
    r, g, b = split_tone(r, g, b,
        shadow=(0.02, 0.03, -0.02),    # olive/earth shadows
        highlight=(0.03, 0.01, -0.03), # warm earth highlights
        s_str=0.7, h_str=0.6)
    # Heavy desaturation is the key to this look
    r, g, b = sat(r, g, b, 0.52)
    return r, g, b


# ─────────────────────────────────────────────
# BLACK & WHITE LOOKS
# ─────────────────────────────────────────────

def bw_clean(r, g, b):
    """Clean B&W — accurate Rec 709 luminance, mild contrast"""
    y = luma(r, g, b)
    # Mild S-curve
    curve = [(0,0.0),(0.25,0.23),(0.5,0.50),(0.75,0.77),(1.0,1.0)]
    y = apply_curve(y, curve)
    return y, y, y

def bw_contrast(r, g, b):
    """High contrast B&W — Ilford HP5/Tri-X look, deep blacks"""
    y = luma(r, g, b)
    # Aggressive S-curve
    curve = [(0,0.0),(0.15,0.08),(0.35,0.28),(0.5,0.50),(0.65,0.72),(0.85,0.92),(1.0,1.0)]
    y = apply_curve(y, curve)
    return y, y, y

def bw_film_grain(r, g, b):
    """B&W with warm tone — classic darkroom print feel, slight warmth"""
    y = luma(r, g, b)
    # Medium contrast
    curve = [(0,0.01),(0.2,0.18),(0.5,0.50),(0.8,0.82),(1.0,0.98)]
    y = apply_curve(y, curve)
    # Slight warm tone (like an aged darkroom print)
    r_out = clamp(y + 0.015)
    g_out = clamp(y + 0.005)
    b_out = clamp(y - 0.010)
    return r_out, g_out, b_out

def bw_faded(r, g, b):
    """Faded B&W — low contrast, lifted blacks, cinematic and dreamy"""
    y = luma(r, g, b)
    # Compress range — lifted blacks, lowered whites
    curve = [(0,0.06),(0.5,0.50),(1.0,0.92)]
    y = apply_curve(y, curve)
    return y, y, y


# ─────────────────────────────────────────────
# GENERATE ALL LUTs
# ─────────────────────────────────────────────

print("Generating ROTOVIDE LUTs...")

LUTS = {
    "film_kodak":        film_kodak,
    "film_fuji":         film_fuji,
    "film_portra":       film_portra,
    "film_expired":      film_expired,
    "cinematic_teal_orange": cinematic_teal_orange,
    "cinematic_cool":    cinematic_cool,
    "cinematic_warm":    cinematic_warm,
    "golden_hour":       golden_hour,
    "midnight_blue":     midnight_blue,
    "muted_earth":       muted_earth,
    "bw_clean":          bw_clean,
    "bw_contrast":       bw_contrast,
    "bw_film_grain":     bw_film_grain,
    "bw_faded":          bw_faded,
}

for name, fn in LUTS.items():
    write_cube(name, fn)

print(f"\nDone. {len(LUTS)} LUTs generated in /app/luts/")
