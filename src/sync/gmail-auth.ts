// src/sync/gmail-auth.ts
import { google, type Auth } from "googleapis";
import fs from "fs";
import path from "path";
import readline from "readline";

const SCOPES = ["https://www.googleapis.com/auth/gmail.readonly"];

export async function getGmailAuth(
  credentialsPath: string,
  tokenPath: string
): Promise<Auth.OAuth2Client> {
  const credentials = JSON.parse(fs.readFileSync(credentialsPath, "utf-8")) as {
    installed?: { client_id: string; client_secret: string; redirect_uris: string[] };
    web?: { client_id: string; client_secret: string; redirect_uris: string[] };
  };

  const { client_id, client_secret, redirect_uris } = credentials.installed ?? credentials.web!;
  const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);

  if (fs.existsSync(tokenPath)) {
    const token = JSON.parse(fs.readFileSync(tokenPath, "utf-8")) as Auth.Credentials;
    oAuth2Client.setCredentials(token);
    return oAuth2Client;
  }

  const authUrl = oAuth2Client.generateAuthUrl({ access_type: "offline", scope: SCOPES });
  console.error("Authorize this app by visiting:\n" + authUrl);

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const code = await new Promise<string>((resolve) => {
    rl.question("Enter the code from that page here: ", (c) => {
      rl.close();
      resolve(c);
    });
  });

  const { tokens } = await oAuth2Client.getToken(code);
  oAuth2Client.setCredentials(tokens);
  fs.mkdirSync(path.dirname(tokenPath), { recursive: true });
  fs.writeFileSync(tokenPath, JSON.stringify(tokens));

  return oAuth2Client;
}
