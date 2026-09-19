import handler from "@tanstack/react-start/server-entry";

export default {
  fetch: handler.fetch,

  async email(message: ForwardableEmailMessage) {
    console.log("Inbound email", message.from, "->", message.to);
  },

  async queue(batch: MessageBatch) {
    for (const message of batch.messages) {
      console.log("Queue message", message.id, message.body);
      message.ack();
    }
  },

  async scheduled(controller: ScheduledController) {
    console.log("Cron", controller.cron, controller.scheduledTime);
  },
};
