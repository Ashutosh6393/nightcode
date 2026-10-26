import { StatusBar } from "./status-bar";
import type { KeyBinding } from "@opentui/core";

type props = {
  onSubmit: (value: string) => void;
  disabled?: boolean;
};

export const TEXTAREA_KEY_BINDINGS: KeyBinding[] = [
    {name: "return", action: "submit"},
    {name: "enter", action: "submit"},
    {name: "return", shift: true, action: "newline"},
    {name: "enter", shift: true, action: "newline"},
]

export function InputBar({ onSubmit, disabled = false }: props) {
  return (
    <box width={"100%"} justifyContent="center">
      <box border={["left"]} borderColor="cyan">
        <box
          position="relative"
          paddingX={2}
          paddingY={1}
          backgroundColor="#1A1A24"
          width={"100%"}
          gap={1}
        >
          <textarea
            focused={!disabled}
            keyBindings={TEXTAREA_KEY_BINDINGS}
            placeholder={`Ask anything... "Fix a bug in the codebase"`}
          />

          <StatusBar />
        </box>
      </box>
    </box>
  );
}
