// Sending e-mail (only used for password reset). Brevo has a free plan (300 mails a day) and needs no domain:
// you verify one sender address by clicking a link in an e-mail. We call its web address directly, so there is
// nothing to install.

export interface Mail {
  to: string;
  subject: string;
  text: string;
}
export type SendMail = (mail: Mail) => Promise<void>;

export function createBrevoMailer(apiKey: string, from: string): SendMail {
  return async ({ to, subject, text }) => {
    const m = from.match(/^(.*)<(.+)>$/); // "Sketchboard <me@example.com>" or just "me@example.com"
    const sender = m ? { name: m[1].trim().replace(/^"|"$/g, ""), email: m[2].trim() } : { name: "Sketchboard", email: from.trim() };
    const res = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { "api-key": apiKey, "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ sender, to: [{ email: to }], subject, textContent: text }),
    });
    if (!res.ok) throw new Error(`Brevo answered ${res.status}`);
  };
}

// Development: print the mail instead of sending it, so you can click the link from the terminal.
export const consoleMailer: SendMail = async ({ to, subject, text }) => {
  console.log(`\n--- e-mail to ${to}: ${subject}\n${text}\n---\n`);
};
