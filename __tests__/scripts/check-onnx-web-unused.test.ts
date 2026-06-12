import { describe, it, expect } from "vitest";
import { importsOnnxWeb } from "../../scripts/check-onnx-web-unused.js";

describe("importsOnnxWeb (#93)", () => {
  it("flags a real ESM import (subpath)", () => {
    expect(importsOnnxWeb(`import*as O from"onnxruntime-web/webgpu";`)).toBe(true);
  });

  it("flags a real ESM import (bare specifier)", () => {
    expect(importsOnnxWeb(`import * as O from "onnxruntime-web";`)).toBe(true);
  });

  it("flags a real CJS require", () => {
    expect(importsOnnxWeb(`const o=require("onnxruntime-web");`)).toBe(true);
  });

  it("ignores the jsdelivr CDN string literal", () => {
    expect(
      importsOnnxWeb("const p=`https://cdn.jsdelivr.net/npm/onnxruntime-web@${v}/dist/`;")
    ).toBe(false);
  });

  it("does not flag the onnxruntime-node import", () => {
    expect(importsOnnxWeb(`import*as N from"onnxruntime-node";`)).toBe(false);
  });

  it("does not flag onnxruntime-common", () => {
    expect(importsOnnxWeb(`import{InferenceSession}from"onnxruntime-common";`)).toBe(false);
  });

  it("passes a clean empty source", () => {
    expect(importsOnnxWeb("")).toBe(false);
  });
});
