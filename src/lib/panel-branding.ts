export const PANEL_BRANDING_QUERY_KEY = ["panel-branding"];
export const PANEL_LOGO_BUCKET = "company-panel-logos";
export const PANEL_NAME_MAX = 20;
export const PANEL_LOGO_INPUT_MAX = 2 * 1024 * 1024;
export const PANEL_LOGO_MAX_DIMENSION = 256;
export const PANEL_LOGO_STORED_MAX = 512 * 1024;
export function panelDisplayName(name: string | null | undefined) {
  return name?.trim() || "BodegaPro";
}
export function validatePanelName(value: string) {
  const name = value.trim().normalize("NFC");
  if (Array.from(name).length > PANEL_NAME_MAX)
    throw new Error("Nombre Panel debe tener como máximo 20 caracteres.");
  return name;
}
export function validatePanelLogoFile(file: Pick<File, "size" | "type">) {
  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type))
    throw new Error("Selecciona una imagen PNG, JPG o WebP.");
  if (file.size <= 0 || file.size > PANEL_LOGO_INPUT_MAX)
    throw new Error("El logo debe pesar como máximo 2 MB.");
}
export async function preparePanelLogo(file: File): Promise<File> {
  validatePanelLogoFile(file);
  let image: ImageBitmap;
  try {
    image = await createImageBitmap(file);
  } catch {
    throw new Error("No se pudo leer la imagen. Selecciona un archivo PNG, JPG o WebP válido.");
  }
  try {
    if (!image.width || !image.height || image.width > 4096 || image.height > 4096)
      throw new Error("El logo debe medir como máximo 4096 × 4096 píxeles.");
    const scale = Math.min(
      1,
      PANEL_LOGO_MAX_DIMENSION / image.width,
      PANEL_LOGO_MAX_DIMENSION / image.height,
    );
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Tu navegador no pudo preparar el logo.");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("No se pudo preparar el logo."))),
        "image/png",
      ),
    );
    if (blob.size > PANEL_LOGO_STORED_MAX)
      throw new Error("El logo preparado es demasiado grande. Prueba con una imagen más simple.");
    return new File([blob], "panel-logo.png", { type: "image/png" });
  } finally {
    image.close();
  }
}
