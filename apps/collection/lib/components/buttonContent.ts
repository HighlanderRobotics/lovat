import { Children, Fragment, isValidElement, type ReactNode } from "react";

// Native Text uses inline layout. Only labels belong inside it; selection rows
// need to remain normal views so their controls and captions can size themselves.
export function renderButtonContent(
  children: ReactNode,
  wrapText: (label: ReactNode, key: string) => ReactNode,
): ReactNode {
  const nodes = Children.toArray(children);
  const isText = (node: ReactNode) =>
    typeof node === "string" || typeof node === "number";

  if (nodes.length === 0) return null;
  if (nodes.every(isText)) return wrapText(nodes, "label");

  return nodes.map((node, index) => {
    if (
      isValidElement<{ children?: ReactNode }>(node) &&
      node.type === Fragment
    ) {
      return renderButtonContent(node.props.children, (label, key) =>
        wrapText(label, `${index}-${key}`),
      );
    }
    return isText(node) ? wrapText(node, `label-${index}`) : node;
  });
}
