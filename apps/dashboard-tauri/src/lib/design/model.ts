export interface DesignNode {
  tag: string;
  id?: string;
  name: string;
  style: string;
  children: (DesignNode | string)[];
  src?: string;
  control?: "button" | "field" | "input";
  label?: string;
  variant?: "primary" | "secondary" | "tertiary" | "danger";
  value?: string;
  inputType?: string;
  choiceGroup?: string;
  choiceDefault?: string;
  choiceValue?: string;
}

export function textOf(node: DesignNode | string): string {
  return typeof node === "string"
    ? node
    : node.children.map(textOf).join(" ").replace(/\s+/g, " ").trim();
}
