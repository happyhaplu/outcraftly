import { createServer } from "http";
import { parse } from "url";
import next from "next";

const dev = false;
const hostname = "0.0.0.0";
const port = 3000;

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  createServer(async (req, res) => {
    try {
      const parsedUrl = parse(req.url, true);
      
      // Force the host header to be the public domain
      const forwardedHost = req.headers["x-forwarded-host"];
      const forwardedProto = req.headers["x-forwarded-proto"];
      
      if (forwardedHost && forwardedProto) {
        // Override the host header with the forwarded one
        req.headers.host = forwardedHost;
      }
      
      await handle(req, res, parsedUrl);
    } catch (err) {
      console.error("Error occurred handling", req.url, err);
      res.statusCode = 500;
      res.end("internal server error");
    }
  })
    .once("error", (err) => {
      console.error(err);
      process.exit(1);
    })
    .listen(port, hostname, () => {
      console.log("> Ready on http://" + hostname + ":" + port);
      console.log("> Public URL: https://staging.outcraftly.com");
    });
});
