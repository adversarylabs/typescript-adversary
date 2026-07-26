export type Message =
  | { kind: "email"; address: string; subject: string }
  | { kind: "sms"; phone: string; body: string };

export function recipient(message: Message): string {
  switch (message.kind) {
    case "email":
      return message.address;
    case "sms":
      return message.phone;
    default: {
      const exhaustive: never = message;
      return exhaustive;
    }
  }
}

export async function deliver(
  message: Message,
  send: (message: Message) => Promise<void>,
): Promise<void> {
  await send(message);
}
