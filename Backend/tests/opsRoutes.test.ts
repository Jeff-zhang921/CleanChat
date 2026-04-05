import { describe, expect, it } from "@jest/globals";
import request from "supertest";
import app from "../index";

describe("ops routes", () => {
  it("returns backend health payload", async () => {
    const response = await request(app).get("/ops/healthz");

    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
    expect(response.body.service).toBe("cleanchat-backend");
    expect(response.body.runtimePersistence).toBeDefined();
    expect(response.body.keepalive).toBeDefined();
  });

  it("supports keepalive alias endpoint", async () => {
    const response = await request(app).get("/keepalive?source=test-suite");

    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
    expect(response.body.source).toBe("test-suite");
  });
});
