/** Marks a widget whose values are illustrations, so none of them is mistaken for a real promise. */
export function ExampleBadge({ children = "Example, not a real promise" }: { children?: string }) {
  return <span className="example">{children}</span>;
}
