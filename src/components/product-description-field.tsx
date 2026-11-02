export function ProductDescriptionField({
  value,
  onChange,
  id = "product-name",
}: {
  value: string;
  onChange: (value: string) => void;
  id?: string;
}) {
  return (
    <div>
      <label className="label" htmlFor={id}>
        Descripción *
      </label>
      <input
        id={id}
        className="input w-full"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required
        maxLength={200}
        placeholder="Ej.: Pintura esmalte al agua blanca"
      />
    </div>
  );
}
