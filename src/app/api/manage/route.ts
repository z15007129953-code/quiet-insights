import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { assertSameOrigin, currentWorkspace } from "../../../lib/api.ts";
import {
  applicationForWorkspace,
  createApplication,
  funnelByName,
  rotateKey,
  saveFunnel,
  updateRetention,
  type Environment,
} from "../../../lib/repository.ts";
import { type Event } from "../../../lib/domain.ts";
import { ingest } from "../../../lib/repository.ts";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const body = (await request.json()) as Record<string, unknown>;
    const workspace = await currentWorkspace();
    if (body.action === "createApp") {
      const name = typeof body.name === "string" ? body.name : "";
      if (!name.trim() || name.trim().length > 80 || /[\r\n]/.test(name))
        throw new Error("Application name must be 1 to 80 characters");
      const result = await createApplication(workspace.id, name, workspace.db);
      return NextResponse.json({
        app: result.app,
        key: result.keys.production,
        keys: result.keys,
      });
    }
    if (body.action === "rotate") {
      const result = await rotateKey(
        workspace.id,
        String(body.appId),
        body.environment === "development" ? "development" : "production",
        workspace.db,
      );
      return NextResponse.json({ app: result.app, key: result.key });
    }
    if (body.action === "funnel") {
      const steps = Array.isArray(body.steps)
        ? body.steps
            .filter((step): step is string => typeof step === "string")
            .map((step) => step.trim())
        : [];
      if (
        steps.length < 2 ||
        steps.length > 5 ||
        steps.some((step) => !/^[A-Za-z][A-Za-z0-9_.:-]{0,99}$/.test(step)) ||
        new Set(steps).size !== steps.length
      )
        throw new Error("Funnels require 2 to 5 distinct valid event steps");
      const windowHours = Number(body.windowHours);
      if (
        !Number.isInteger(windowHours) ||
        windowHours < 1 ||
        windowHours > 168
      )
        throw new Error("Window must be between 1 and 168 hours");
      const name = typeof body.name === "string" ? body.name.trim() : "";
      if (!name || name.length > 80 || /[\r\n]/.test(name))
        throw new Error("Funnel name must be 1 to 80 characters");
      return NextResponse.json({
        funnel: await saveFunnel(
          workspace.id,
          String(body.appId),
          name,
          steps,
          windowHours,
          workspace.db,
        ),
      });
    }
    if (body.action === "retention") {
      const days = Number(body.days);
      if (days !== 7 && days !== 30 && days !== 90)
        throw new Error("Retention must be 7, 30 or 90 days");
      return NextResponse.json({
        app: await updateRetention(
          workspace.id,
          String(body.appId),
          days,
          workspace.db,
        ),
      });
    }
    if (body.action === "testEvent") {
      const appId = String(body.appId);
      const environment: Environment =
        body.environment === "development" ? "development" : "production";
      const name = typeof body.name === "string" ? body.name.trim() : "";
      if (!/^[A-Za-z][A-Za-z0-9_.:-]{0,99}$/.test(name))
        throw new Error(
          "Event name must start with a letter and use only letters, numbers, dots, underscores, colons or hyphens",
        );
      const owned = await applicationForWorkspace(
        workspace.id,
        appId,
        workspace.db,
      );
      if (!owned) throw new Error("Application not found");
      const stamp = Date.now();
      const result = await ingest(
        appId,
        environment,
        {
          batchId: `ui-test-${stamp}-${randomUUID()}`,
          events: [
            {
              name,
              timestamp: new Date(stamp).toISOString(),
              deviceId: `browser-test-${randomUUID()}`,
              sessionId: `browser-session-${randomUUID()}`,
              version: "1.0.0",
              os: "web",
              country: "US",
              properties: { source: "quiet-insights-test", screen: "connect" },
            },
          ],
        },
        owned.retention,
        workspace.db,
      );
      return NextResponse.json({
        ok: true,
        accepted: result.inserted,
        duplicate: result.duplicate,
      });
    }
    if (body.action === "sample") {
      const appId = String(body.appId);
      const environment: Environment =
        body.environment === "development" ? "development" : "production";
      const owned = await applicationForWorkspace(
        workspace.id,
        appId,
        workspace.db,
      );
      if (!owned) throw new Error("Application not found");
      const now = Date.now();
      const names = [
        "sample_opened",
        "sample_viewed",
        "sample_saved",
        "sample_shared",
      ];
      const events: Event[] = Array.from({ length: 56 }, (_, index) => {
        const day = Math.floor(index / 4);
        const step = index % 4;
        return {
          name: names[step],
          timestamp: new Date(
            now - day * 86_400_000 - 60 * 60_000 + step * 15 * 60_000,
          ).toISOString(),
          deviceId: `sample-device-${day % 10}`,
          sessionId: `sample-session-${day}`,
          version: day % 3 ? "1.0.0" : "1.1.0",
          os: day % 2 ? "Android" : "iOS",
          country: day % 3 ? "US" : "CN",
          properties: {
            screen: step % 2 ? "editor" : "home",
            source: "demo",
            plan: day % 4 ? "free" : "pro",
          },
        };
      });
      const result = await ingest(
        appId,
        environment,
        { batchId: `sample-${Date.now()}`, events },
        owned.retention,
        workspace.db,
      );
      return NextResponse.json({ ok: true, ...result });
    }
    if (body.action === "demo") {
      const appId = String(body.appId);
      const environment: Environment =
        body.environment === "development" ? "development" : "production";
      const owned = await applicationForWorkspace(
        workspace.id,
        appId,
        workspace.db,
      );
      if (!owned) throw new Error("Application not found");
      const now = Date.now();
      const names = [
        "app_opened",
        "workspace_viewed",
        "note_created",
        "note_shared",
      ];
      const events: Event[] = Array.from({ length: 56 }, (_, index) => {
        const day = Math.floor(index / 4);
        const step = index % 4;
        return {
          name: names[step],
          timestamp: new Date(
            now - day * 86_400_000 - 60 * 60_000 + step * 15 * 60_000,
          ).toISOString(),
          deviceId: `demo-device-${day % 10}`,
          sessionId: `demo-session-${day}`,
          version: day % 3 === 0 ? "1.1.0" : "1.0.0",
          os: day % 2 ? "Android" : "iOS",
          country: day % 3 ? "US" : "CN",
          properties: {
            screen: step === 0 ? "home" : "workspace",
            source: "quiet-insights-demo",
            plan: day % 4 ? "free" : "pro",
            feature: step > 1 ? "notes" : "navigation",
          },
        };
      });
      const result = await ingest(
        appId,
        environment,
        { batchId: `demo-${Date.now()}-${randomUUID()}`, events },
        owned.retention,
        workspace.db,
      );
      const funnelName = "Demo activation path";
      const existing = await funnelByName(
        workspace.id,
        appId,
        funnelName,
        workspace.db,
      );
      if (!existing) {
        await saveFunnel(
          workspace.id,
          appId,
          funnelName,
          names,
          24,
          workspace.db,
        );
      }
      return NextResponse.json({
        ok: true,
        accepted: result.inserted,
        duplicate: result.duplicate,
        funnelCreated: !existing,
        funnelName,
      });
    }
    throw new Error("Unknown management action");
  } catch (error) {
    const status =
      error instanceof Error && /not found/i.test(error.message) ? 404 : 400;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Request failed" },
      { status },
    );
  }
}
