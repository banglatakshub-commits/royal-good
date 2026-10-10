import { createFileRoute } from "@tanstack/react-router";

/**
 * Diagnostic endpoint: returns the server's current outbound (egress) IP address.
 * Give this IP to the NekPay merchant manager so they can whitelist it and generate
 * the Withdrawal/Transfer key. Payout requests leave the server from this same IP.
 *
 * Open: https://<your-domain>/api/public/ip
 */
export const Route = createFileRoute("/api/public/ip")({
  server: {
    handlers: {
      GET: async () => {
        const sources = [
          "https://api.ipify.org?format=json",
          "https://ifconfig.co/json",
          "https://api64.ipify.org?format=json",
        ];
        for (const url of sources) {
          try {
            const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
            if (!res.ok) continue;
            const body: unknown = await res.json();
            const ip =
              body && typeof body === "object" && "ip" in body
                ? String((body as { ip: unknown }).ip)
                : "";
            if (ip) {
              return new Response(JSON.stringify({ ip, source: url }, null, 2), {
                status: 200,
                headers: { "content-type": "application/json" },
              });
            }
          } catch {
            // try the next source
          }
        }
        return new Response(
          JSON.stringify({ error: "Could not determine the server's outbound IP." }, null, 2),
          { status: 502, headers: { "content-type": "application/json" } },
        );
      },
    },
  },
});
