import { createCliRenderer, TextAttributes } from "@opentui/core";
import { createRoot } from "@opentui/react";
import { Header } from "./components/header";
// import { StatusBar } from "./components/status-bar";
import { InputBar } from "./components/input-bar";

function App() {
  return (
    <box
      flexDirection="column"
      alignItems="center"
      justifyContent="center"
      width={"100%"}
      height={"100%"}
      gap={2}
    >
      <Header />
      <box width={"100%"} maxWidth={78} paddingX={2}>
        <InputBar onSubmit={() => {}} disabled={false} />
      </box>
    </box>
  );
}

const renderer = await createCliRenderer();
createRoot(renderer).render(<App />);
