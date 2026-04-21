import { createPoll, CreatePollError } from './twitchApi.js';

/**
 * Builds the `POST /api/twitch/create-poll` request handler.
 *
 * Isolating the handler as a factory lets tests mount it against a fresh
 * `OverlayState` with mocked `authStore` + `fetch` without booting the full
 * server. It also keeps `src/server.js` focused on route registration.
 *
 * On success: state.setPollFromHelix + state.setConnection (lastEventAt),
 * response 201 { ok, poll, snapshot }.
 * On `CreatePollError`: response {error.status} { error: { code, message, hint } }.
 * On unexpected error: 502 { error: { code: 'upstream', message } }.
 */
export function createPollRouteHandler({ config, authStore, state, logger }) {
  return async (req, res) => {
    try {
      const normalized = await createPoll(config, authStore, {
        title: req.body?.title,
        choices: req.body?.choices,
        duration: req.body?.duration
      });
      state.setPollFromHelix(normalized);
      state.setConnection({ lastEventAt: new Date().toISOString() });
      return res.status(201).json({ ok: true, poll: normalized, snapshot: state.getSnapshot() });
    } catch (error) {
      if (error instanceof CreatePollError) {
        const status = error.status || 400;
        if (logger) {
          if (status >= 500) logger.error(`create-poll upstream: ${error.message}`);
          else logger.warn(`create-poll ${error.code}: ${error.message}`);
        }
        return res.status(status).json({
          error: {
            code: error.code,
            message: error.message,
            hint: error.hint
          }
        });
      }
      if (logger) logger.error(error.message);
      return res.status(502).json({
        error: {
          code: 'upstream',
          message: error.message || 'Unexpected error creating poll.'
        }
      });
    }
  };
}
