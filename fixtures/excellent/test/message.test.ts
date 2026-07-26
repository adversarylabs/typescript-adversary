import assert from "node:assert/strict";
import test from "node:test";
import { deliver, recipient, type Message } from "../src/message.js";

test("narrows recipients and waits for delivery", async () => {
  const message: Message = {
    kind: "email",
    address: "engineer@example.com",
    subject: "review",
  };
  let delivered = false;
  await deliver(message, async () => {
    delivered = true;
  });
  assert.equal(recipient(message), "engineer@example.com");
  assert.equal(delivered, true);
});
