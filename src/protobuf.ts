// Minimal protobuf (proto2) decoder covering only the AnyList messages we export.
// Field numbers come from AnyList's pcov.proto schema.

type Scalar = "string" | "double" | "int32" | "bool";
type FieldDef = {
  name: string;
  type: Scalar | MessageDef;
  repeated?: boolean;
};
export type MessageDef = Record<number, FieldDef>;

const Ingredient: MessageDef = {
  6: { name: "identifier", type: "string" },
  1: { name: "rawIngredient", type: "string" },
  2: { name: "name", type: "string" },
  3: { name: "quantity", type: "string" },
  4: { name: "note", type: "string" },
  7: { name: "isHeading", type: "bool" },
};

const Recipe: MessageDef = {
  1: { name: "identifier", type: "string" },
  2: { name: "timestamp", type: "double" },
  3: { name: "name", type: "string" },
  4: { name: "icon", type: "string" },
  5: { name: "note", type: "string" },
  6: { name: "sourceName", type: "string" },
  7: { name: "sourceUrl", type: "string" },
  8: { name: "ingredients", type: Ingredient, repeated: true },
  9: { name: "preparationSteps", type: "string", repeated: true },
  11: { name: "photoIds", type: "string", repeated: true },
  12: { name: "adCampaignId", type: "string" },
  13: { name: "photoUrls", type: "string", repeated: true },
  14: { name: "scaleFactor", type: "double" },
  15: { name: "rating", type: "int32" },
  16: { name: "creationTimestamp", type: "double" },
  17: { name: "nutritionalInfo", type: "string" },
  18: { name: "cookTime", type: "int32" },
  19: { name: "prepTime", type: "int32" },
  20: { name: "servings", type: "string" },
  21: { name: "paprikaIdentifier", type: "string" },
};

const RecipeCollection: MessageDef = {
  1: { name: "identifier", type: "string" },
  2: { name: "timestamp", type: "double" },
  3: { name: "name", type: "string" },
  4: { name: "recipeIds", type: "string", repeated: true },
};

const RecipeDataResponse: MessageDef = {
  1: { name: "timestamp", type: "double" },
  2: { name: "allRecipesCollection", type: RecipeCollection },
  3: { name: "recipes", type: Recipe, repeated: true },
  5: { name: "recipeCollections", type: RecipeCollection, repeated: true },
  9: { name: "recipeDataId", type: "string" },
};

export const UserDataResponse: MessageDef = {
  3: { name: "recipeDataResponse", type: RecipeDataResponse },
};

class Reader {
  pos = 0;
  constructor(private buf: Buffer, private end = buf.length) {}

  done() {
    return this.pos >= this.end;
  }

  varint(): bigint {
    let result = 0n;
    let shift = 0n;
    for (;;) {
      if (this.pos >= this.end) throw new Error("Truncated varint");
      const byte = this.buf[this.pos++];
      result |= BigInt(byte & 0x7f) << shift;
      if (!(byte & 0x80)) return result;
      shift += 7n;
      if (shift > 63n) throw new Error("Varint too long");
    }
  }

  bytes(): Buffer {
    const len = Number(this.varint());
    if (this.pos + len > this.end) throw new Error("Truncated field");
    const out = this.buf.subarray(this.pos, this.pos + len);
    this.pos += len;
    return out;
  }

  fixed(size: 4 | 8): Buffer {
    if (this.pos + size > this.end) throw new Error("Truncated fixed field");
    const out = this.buf.subarray(this.pos, this.pos + size);
    this.pos += size;
    return out;
  }

  skip(wireType: number) {
    switch (wireType) {
      case 0: this.varint(); break;
      case 1: this.fixed(8); break;
      case 2: this.bytes(); break;
      case 5: this.fixed(4); break;
      default: throw new Error(`Unsupported wire type ${wireType}`);
    }
  }
}

function readScalar(r: Reader, type: Scalar, wireType: number): unknown {
  switch (type) {
    case "string":
      return r.bytes().toString("utf-8");
    case "double":
      if (wireType !== 1) throw new Error("Expected 64-bit field for double");
      return r.fixed(8).readDoubleLE(0);
    case "int32":
      return Number(BigInt.asIntN(32, r.varint()));
    case "bool":
      return r.varint() !== 0n;
  }
}

export function decode(buf: Buffer, def: MessageDef): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of Object.values(def)) out[f.name] = f.repeated ? [] : null;

  const r = new Reader(buf);
  while (!r.done()) {
    const key = r.varint();
    const fieldNo = Number(key >> 3n);
    const wireType = Number(key & 7n);
    const field = def[fieldNo];
    if (!field) {
      r.skip(wireType);
      continue;
    }

    const values: unknown[] = [];
    if (typeof field.type === "object") {
      values.push(decode(r.bytes(), field.type));
    } else if (wireType === 2 && field.type !== "string") {
      // Packed repeated scalars
      const packed = new Reader(r.bytes());
      while (!packed.done()) {
        values.push(readScalar(packed, field.type, field.type === "double" ? 1 : 0));
      }
    } else {
      values.push(readScalar(r, field.type, wireType));
    }

    if (field.repeated) (out[field.name] as unknown[]).push(...values);
    else out[field.name] = values[values.length - 1];
  }
  return out;
}
