"use client";
/* 選んだらすぐ、入っているフォームを送る並べ替えの欄（JavaScript が無いときは隣の「検索」ボタンで送る） */

type Props = {
  name: string;
  defaultValue: string;
  options: readonly { value: string; label: string }[];
  className?: string;
  ariaLabel?: string;
};

export default function AutoSubmitSelect({ name, defaultValue, options, className, ariaLabel }: Props) {
  return (
    <select
      name={name}
      defaultValue={defaultValue}
      className={className}
      aria-label={ariaLabel}
      onChange={(e) => e.currentTarget.form?.requestSubmit()}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
