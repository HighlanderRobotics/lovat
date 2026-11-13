import { TextField as MagnoliaTextField } from "@highlanderrobotics/magnolia-react-native";
import { forwardRef, type ComponentProps } from "react";
import type { TextInput } from "react-native";

type Props = Omit<ComponentProps<typeof MagnoliaTextField>, "ref">;

// Keep Collection's multiline keyboard/scroll contract while sharing field states.
const TextField = forwardRef<TextInput, Props>(
  ({ multiline, density = "comfortable", style, ...props }, ref) => (
    <MagnoliaTextField
      {...props}
      ref={ref}
      density={density}
      multiline={multiline}
      accessibilityLabel={props.accessibilityLabel ?? props.placeholder}
      submitBehavior={
        props.submitBehavior ?? (multiline ? "newline" : "blurAndSubmit")
      }
      scrollEnabled={multiline ? false : props.scrollEnabled}
      style={[
        {
          textAlignVertical: multiline ? "top" : "auto",
          lineHeight: density === "comfortable" ? 23.5 : 20.56,
        },
        style,
      ]}
    />
  ),
);
TextField.displayName = "CollectionTextField";
export default TextField;
