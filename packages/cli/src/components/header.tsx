export function Header() {
  return (
    <box justifyContent="center" alignItems="center">
      <box flexDirection="row" alignItems="center" gap={0.5}>
        <ascii-font font="tiny" text="Night" color="white" />
        <ascii-font font="tiny" text="Code" color="gray" />
      </box>
    </box>
  );
}
