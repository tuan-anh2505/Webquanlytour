/** Nhãn và input thống nhất; các biểu mẫu vẫn dùng validation phía backend. */
export function FormField({ label, name, as = 'input', children, hint, ...props }) {
  const Control = as;
  return <label className="field"><span>{label}{props.required && <b aria-hidden="true"> *</b>}</span><Control name={name} {...props}>{children}</Control>{hint && <small>{hint}</small>}</label>;
}
