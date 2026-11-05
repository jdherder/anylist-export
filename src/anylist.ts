// Small AnyList client: just enough to log in and read recipe data.
import * as crypto from "crypto";
import * as fs from "fs/promises";
import { decode, UserDataResponse } from "./protobuf";

const BASE_URL = "https://www.anylist.com";
const API_VERSION = "3";

type Credentials = {
  clientId?: string;
  accessToken?: string;
  refreshToken?: string;
};

export type Ingredient = {
  identifier: string | null;
  rawIngredient: string | null;
  name: string | null;
  quantity: string | null;
  note: string | null;
  isHeading: boolean | null;
};

export type Recipe = {
  identifier: string;
  name: string | null;
  ingredients: Ingredient[];
  preparationSteps: string[];
  [key: string]: unknown;
};

export type RecipeCollection = {
  identifier: string;
  name: string | null;
  recipeIds: string[];
  [key: string]: unknown;
};

export type RecipeData = {
  recipes: Recipe[];
  recipeCollections: RecipeCollection[];
};

export class AnyListClient {
  private creds: Credentials = {};

  constructor(
    private email: string,
    private password: string,
    private credentialsFile?: string
  ) {}

  async getRecipeData(): Promise<RecipeData> {
    await this.loadCredentials();
    if (!this.creds.clientId) {
      this.creds.clientId = crypto.randomUUID().replace(/-/g, "");
    }
    if (!this.creds.accessToken || !this.creds.refreshToken) {
      await this.fetchTokens();
    }

    let res = await this.dataRequest("data/user-data/get");
    if (res.status === 401) {
      await this.refreshTokens();
      res = await this.dataRequest("data/user-data/get");
    }
    if (!res.ok) {
      throw new Error(`Fetching user data failed: HTTP ${res.status}`);
    }

    const body = Buffer.from(await res.arrayBuffer());
    const data = decode(body, UserDataResponse).recipeDataResponse as
      | RecipeData
      | null;
    if (!data) throw new Error("Response did not contain recipe data");
    return data;
  }

  private dataRequest(endpoint: string) {
    return fetch(`${BASE_URL}/${endpoint}`, {
      method: "POST",
      redirect: "manual",
      headers: {
        "X-AnyLeaf-API-Version": API_VERSION,
        "X-AnyLeaf-Client-Identifier": this.creds.clientId!,
        Authorization: `Bearer ${this.creds.accessToken}`,
      },
    });
  }

  private async tokenRequest(endpoint: string, fields: Record<string, string>) {
    const form = new FormData();
    for (const [k, v] of Object.entries(fields)) form.append(k, v);
    return fetch(`${BASE_URL}/${endpoint}`, {
      method: "POST",
      redirect: "manual",
      headers: { "X-AnyLeaf-API-Version": API_VERSION },
      body: form,
    });
  }

  private async fetchTokens() {
    console.log("Requesting new AnyList tokens with email/password");
    const res = await this.tokenRequest("auth/token", {
      email: this.email,
      password: this.password,
    });
    if (!res.ok) {
      throw new Error(
        `AnyList login failed: HTTP ${res.status}` +
          (res.status === 401 ? " (check ANYLIST_EMAIL / ANYLIST_PASSWORD)" : "")
      );
    }
    await this.saveTokens(await res.json());
  }

  private async refreshTokens() {
    const res = await this.tokenRequest("auth/token/refresh", {
      refresh_token: this.creds.refreshToken ?? "",
    });
    if (res.status === 401) {
      await this.fetchTokens();
      return;
    }
    if (!res.ok) throw new Error(`Token refresh failed: HTTP ${res.status}`);
    await this.saveTokens(await res.json());
  }

  private async saveTokens(json: { access_token?: string; refresh_token?: string }) {
    if (!json.access_token || !json.refresh_token) {
      throw new Error("AnyList token response was missing tokens");
    }
    this.creds.accessToken = json.access_token;
    this.creds.refreshToken = json.refresh_token;
    await this.storeCredentials();
  }

  // Tokens are stored encrypted with a key derived from the password
  // (same format the `anylist` npm package used).
  private key() {
    return Buffer.from(
      crypto.createHash("sha256").update(this.password).digest("base64").slice(0, 32)
    );
  }

  private async loadCredentials() {
    if (!this.credentialsFile) return;
    try {
      const { iv, cipher } = JSON.parse(await fs.readFile(this.credentialsFile, "utf-8"));
      const decipher = crypto.createDecipheriv("aes-256-cbc", this.key(), Buffer.from(iv, "hex"));
      const plain = Buffer.concat([decipher.update(Buffer.from(cipher, "hex")), decipher.final()]);
      this.creds = JSON.parse(plain.toString("utf-8"));
    } catch (error: any) {
      if (error?.code !== "ENOENT") {
        console.warn("Ignoring unreadable saved AnyList credentials");
      }
      this.creds = {};
    }
  }

  private async storeCredentials() {
    if (!this.credentialsFile) return;
    const iv = crypto.randomBytes(16);
    const c = crypto.createCipheriv("aes-256-cbc", this.key(), iv);
    const enc = Buffer.concat([c.update(JSON.stringify(this.creds)), c.final()]);
    await fs.writeFile(
      this.credentialsFile,
      JSON.stringify({ iv: iv.toString("hex"), cipher: enc.toString("hex") }),
      { mode: 0o600 }
    );
  }
}
