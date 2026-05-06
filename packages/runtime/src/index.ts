/**
 * @stele/runtime — platform-agnostic runtime for .stele artifacts.
 *
 * The entry point for host adapters (desktop, web-viewer). Re-exports the
 * transform pipeline, sandbox-HTML generator, and manifest parser. Host
 * adapters supply their own bridge implementation wired to local storage
 * and external-navigation primitives.
 */

export * from './manifest';
export * from './sandbox';
export * from './transform';
export * from './pair-crypto';
export * from './pair-rtc';
export * from './rooms';
