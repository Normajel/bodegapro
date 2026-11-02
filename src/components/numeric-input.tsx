import { forwardRef, useEffect, useState, type InputHTMLAttributes } from "react";

type NumericInputProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "value" | "defaultValue" | "type"
> & {
  type?: "number";
  value?: number | string | undefined;
  defaultValue?: number | string | undefined;
};

function inputText(value: number | string | undefined, locked: boolean) {
  if (value === undefined || (typeof value === "number" && !Number.isFinite(value))) return "";
  return value === 0 && !locked ? "" : String(value);
}

// Mantiene el texto de edición separado del número usado por cálculos y guardados.
// Number("") devuelve 0: ese cero no debe volver a llenar el campo al borrarlo.
export const NumericInput = forwardRef<HTMLInputElement, NumericInputProps>(function NumericInput(
  { value, defaultValue, onChange, inputMode, step, disabled, readOnly, type: _type, ...props },
  ref,
) {
  const locked = Boolean(disabled || readOnly);
  const [draft, setDraft] = useState(() => inputText(value ?? defaultValue, locked));
  useEffect(() => {
    if (value !== undefined) setDraft(inputText(value, locked));
  }, [value, locked]);

  return (
    <input
      {...props}
      ref={ref}
      type="number"
      step={step}
      disabled={disabled}
      readOnly={readOnly}
      inputMode={
        inputMode ??
        (step === "any" || (Number(step) > 0 && Number(step) < 1) ? "decimal" : "numeric")
      }
      value={draft}
      onChange={(event) => {
        setDraft(event.target.value);
        onChange?.(event);
      }}
    />
  );
});
