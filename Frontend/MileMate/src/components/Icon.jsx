export default function Icon({ name, fill = false, className = '' }) {
  return (
    <span className={`material-symbols-rounded ${className}`} style={{ fontVariationSettings: `'FILL' ${fill ? 1 : 0}` }}>
      {name}
    </span>
  );
}
