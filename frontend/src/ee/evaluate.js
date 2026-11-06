/**
 * Non-blocking Earth Engine evaluation.
 *
 * `ee.ComputedObject.prototype.getInfo()` is a *synchronous* call in the
 * browser build: when no callback is supplied the API client is constructed
 * with `sync = true` and the request is made with a blocking XMLHttpRequest.
 * A `reduceRegions()` over hundreds of fields can take tens of seconds, so the
 * whole tab locks up and the browser eventually shows "Page unresponsive".
 *
 * `ee.data.computeValue(obj, callback)` passes a callback, which puts the same
 * client into async mode (`fetch`-based). This helper wraps it in a promise.
 */
import { getEE } from './auth';

function toError(err) {
  if (err instanceof Error) return err;
  if (err && typeof err === 'object') {
    const message =
      err.message || err.error?.message || err.reason || null;
    if (message) return new Error(message);
    try {
      return new Error(JSON.stringify(err).slice(0, 500));
    } catch {
      return new Error('Earth Engine request failed');
    }
  }
  return new Error(String(err || 'Earth Engine request failed'));
}

/**
 * Resolve an Earth Engine object asynchronously.
 * @param {object} obj any `ee.ComputedObject`
 * @returns {Promise<any>}
 */
export function evaluate(obj, timeoutMs = 300000) {
  const ee = getEE();

  // Older library builds expose evaluate() but not computeValue(); fall back
  // to the blocking call rather than failing outright.
  if (typeof ee.data?.computeValue !== 'function') {
    return Promise.resolve(obj.getInfo());
  }

  return new Promise((resolve, reject) => {
    let settled = false;
    let timer = null;
    const finish = (fn) => (value) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      fn(value);
    };

    timer = setTimeout(
      finish(() => reject(new Error('Earth Engine request timed out after 5 minutes'))),
      timeoutMs
    );

    try {
      ee.data.computeValue(obj, (value, error) => {
        if (error) finish(reject)(toError(error));
        else finish(resolve)(value);
      });
    } catch (err) {
      finish(reject)(toError(err));
    }
  });
}

/** Yield to the browser so React can paint between network round-trips. */
export function nextFrame() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}
