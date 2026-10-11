"use client";
import {
  McpAuthorization,
  SignIn,
  type McpAccessLevel,
} from "@avgeek-oss/design-system";
import { useEffect, useRef, useState } from "react";
import { authorizationCallback } from "../lib/oauth";
import { Brand } from "./brand";
import { McpClientLogo } from "./mcp-client-logo";
import { AuthScreen } from "@avgeek-oss/design-system/patterns/auth/auth-screen";
import {
  QueryLoading,
  QueryError,
} from "@avgeek-oss/design-system/patterns/feedback/query-state";

type ConnectionRequest = {
  client_id: string;
  client_name: string;
  redirect_uri: string;
  csrf_token: string;
  authenticated: boolean;
  availableAccessLevels: McpAccessLevel[];
};

export function OAuthPage({ apiBaseUrl }: { apiBaseUrl: string }) {
  const [connection, setConnection] = useState<ConnectionRequest>();
  const [loadError, setLoadError] = useState<string>();
  const [error, setError] = useState<string>();
  const [accessLevel, setAccessLevel] = useState<McpAccessLevel>("read");
  const [pending, setPending] = useState(false);
  const inFlight = useRef(false);
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch(apiBaseUrl + "/oauth/request", {
          cache: "no-store",
          credentials: "include",
          redirect: "error",
          signal: controller.signal,
        });
        if (!response.ok)
          throw new Error("Connection expired. Restart from your MCP client.");
        setConnection(await response.json());
      } catch (cause) {
        if (!controller.signal.aborted)
          setLoadError(
            cause instanceof Error
              ? cause.message
              : "Unable to load this connection.",
          );
      }
    }
    void load();
    return () => controller.abort();
  }, [apiBaseUrl]);
  async function post(body: object) {
    if (!connection)
      throw new Error("Restart the connection from your MCP client.");
    const response = await fetch(apiBaseUrl + "/oauth/approve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ csrf_token: connection.csrf_token, ...body }),
      cache: "no-store",
      credentials: "include",
      redirect: "error",
    });
    if (!response.ok) {
      const failure = await response.json();
      throw new Error(
        failure.error_description ??
          failure.message ??
          "Unable to connect. Try again.",
      );
    }
    return response;
  }
  async function decide(action: "allow" | "deny") {
    if (!connection || inFlight.current) return;
    inFlight.current = true;
    setPending(true);
    setError(undefined);
    try {
      const result: { redirect_to: string } = await (
        await post(action === "allow" ? { action, accessLevel } : { action })
      ).json();
      window.location.assign(
        authorizationCallback(
          apiBaseUrl,
          connection.redirect_uri,
          result.redirect_to,
          action,
        ),
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Unable to connect. Try again.",
      );
      inFlight.current = false;
      setPending(false);
    }
  }
  if (!connection)
    return (
      <AuthScreen brand={<Brand />} title="Connect to Vitalog">
        {loadError ? <QueryError message={loadError} /> : <QueryLoading />}
      </AuthScreen>
    );
  if (!connection.authenticated)
    return (
      <SignIn
        brand={<Brand />}
        onSubmit={async ({ identifier, password }) => {
          await post({ action: "authenticate", email: identifier, password });
          setConnection({ ...connection, authenticated: true });
        }}
      />
    );
  return (
    <McpAuthorization
      brand={<Brand />}
      productName="Vitalog"
      clientName={connection.client_name}
      clientLogo={
        <McpClientLogo
          client={
            connection.client_id.startsWith("https://chatgpt.com/oauth/codex/")
              ? "codex"
              : "unknown"
          }
        />
      }
      accessLevel={accessLevel}
      availableAccessLevels={connection.availableAccessLevels}
      onAccessLevelChange={setAccessLevel}
      isPending={pending}
      error={error}
      onApprove={() => void decide("allow")}
      onDeny={() => void decide("deny")}
    />
  );
}
