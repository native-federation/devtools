/**
 * Repository schema allowlist and host-side re-projection. The repository
 * schemas are the corpus-validated V2 shapes (ground truth: captures/ +
 * docs/work/v2/shape-validation.md), covering both registry-format
 * generations: participants carry `entries` (v4.5+) or `file` (v4),
 * scoped-externals has its own single-object schema, and remotes
 * carry per-remote `integrity` maps whose SRI hash values are collected
 * by policy. Hand-sync discipline: the in-page probe
 * (passive-probe.ts) inlines the same schemas — changes here need
 * mirroring there.
 *
 * `projectSchema` copies only recognized fields out of an untrusted value.
 * The mapper runs every raw probe result through it a second time on the
 * host side: the in-page probe already projects with inline caps, but its
 * return value crossed the eval boundary and is attacker-shaped on a
 * hostile page — nothing from it is trusted until it passed this
 * projection (which also sanitizes every `url`-typed field).
 */
import { appendError } from './errors';
import {
  boundedString,
  childContext,
  defineSafe,
  isObjectLike,
  readDataProperty,
  safeArrayLength,
  safeOwnKeys,
  type SafeContext,
} from './safe';
import { isValidSri, sanitizeUrl } from './privacy';

export type SchemaNode =
  | { type: 'string' }
  | { type: 'url' }
  | { type: 'boolean' }
  | { type: 'integrity' }
  | { type: 'array'; item: SchemaNode }
  | { type: 'record'; fields: Record<string, SchemaNode> }
  | { type: 'map'; value: SchemaNode };

const string: SchemaNode = Object.freeze({ type: 'string' });
const url: SchemaNode = Object.freeze({ type: 'url' });
const boolean: SchemaNode = Object.freeze({ type: 'boolean' });
const integrity: SchemaNode = Object.freeze({ type: 'integrity' });

// `file` fields and `entries` values are relative URLs (resolved against
// the scope when fetched) — the `url` node's relative branch strips query
// and fragment. `bundle` is a bundle name (join key into shared-chunks),
// not a URL.
const fileEntries: SchemaNode = { type: 'map', value: url };
const remoteProvider: SchemaNode = {
  type: 'record',
  fields: {
    bundle: string,
    cached: boolean,
    entries: fileEntries,
    file: url,
    name: string,
    pool: string,
    poolCause: string,
    requiredVersion: string,
    servedBy: string,
    strictVersion: boolean,
  },
};
const version: SchemaNode = {
  type: 'record',
  fields: {
    action: string,
    host: boolean,
    remotes: { type: 'array', item: remoteProvider },
    tag: string,
  },
};
const external: SchemaNode = {
  type: 'record',
  fields: {
    dirty: boolean,
    poolName: string,
    versions: { type: 'array', item: version },
  },
};
const externalScopes: SchemaNode = {
  type: 'map',
  value: { type: 'map', value: external },
};
// scoped-externals has its own schema: a single object per package — no
// `versions` array, no `dirty`, no negotiation fields.
const scopedPackage: SchemaNode = {
  type: 'record',
  fields: {
    bundle: string,
    entries: fileEntries,
    tag: string,
  },
};
const scopedScopes: SchemaNode = {
  type: 'map',
  value: { type: 'map', value: scopedPackage },
};
const expose: SchemaNode = {
  type: 'record',
  fields: {
    file: url,
    moduleName: url,
  },
};
const remote: SchemaNode = {
  type: 'record',
  fields: {
    exposes: { type: 'array', item: expose },
    integrity,
    scopeUrl: url,
  },
};

export const REPOSITORY_SCHEMAS = Object.freeze({
  remotes: { type: 'map', value: remote } as SchemaNode,
  'scoped-externals': scopedScopes,
  'shared-externals': externalScopes,
  'shared-chunks': {
    type: 'map',
    value: { type: 'map', value: { type: 'array', item: string } },
  } as SchemaNode,
});

/**
 * Shape of an import map — `importShim.getImportMap()` as returned by the
 * shim map probe, and equally each JSON-parsed document map tag: plain
 * records for imports, per-scope imports, and integrity. The `integrity`
 * node keeps sanitized keys and validated SRI values; for the shim map the
 * mapper then drops the hash values (presence only), while per-tag and
 * per-remote integrity keep them by policy.
 */
export const EFFECTIVE_IMPORT_MAP_SCHEMA: SchemaNode = {
  type: 'record',
  fields: {
    imports: { type: 'map', value: url },
    scopes: { type: 'map', value: { type: 'map', value: url } },
    integrity,
  },
};

export function projectSchema(
  value: unknown,
  schema: SchemaNode,
  context: SafeContext,
  depth = 0,
): unknown {
  if (depth > context.limits.maxDepth) {
    appendError(context.errors, context.limits, context.stage, 'depth-limit', {
      path: context.path,
      retained: context.limits.maxDepth,
    });
    return undefined;
  }

  if (schema.type === 'string') {
    return boundedString(value, context) ?? undefined;
  }
  if (schema.type === 'url') {
    const bounded = boundedString(value, context);
    if (bounded === null) {
      return undefined;
    }
    const sanitized = sanitizeUrl(bounded);
    if (sanitized === null) {
      appendError(context.errors, context.limits, context.stage, 'invalid-url', {
        path: context.path,
      });
      return undefined;
    }
    return sanitized;
  }
  if (schema.type === 'boolean') {
    return typeof value === 'boolean' ? value : undefined;
  }
  if (schema.type === 'integrity') {
    if (!isObjectLike(value)) {
      return undefined;
    }
    const output = {};
    for (const key of safeOwnKeys(value, context)) {
      const entryContext = childContext(context, `${context.path}.integrity.entry`);
      const entry = readDataProperty(value, key, entryContext);
      if (entry.status !== 'data') {
        continue;
      }
      const bounded = boundedString(entry.value, entryContext);
      const sanitizedKey = sanitizeUrl(key);
      if (sanitizedKey === null || !isValidSri(bounded)) {
        appendError(context.errors, context.limits, context.stage, 'invalid-integrity', {
          path: entryContext.path,
        });
        continue;
      }
      defineSafe(output, sanitizedKey, bounded);
    }
    return output;
  }
  if (schema.type === 'array') {
    const length = safeArrayLength(value, context);
    if (length === null) {
      return undefined;
    }
    const output: unknown[] = [];
    for (let index = 0; index < length; index += 1) {
      const itemContext = childContext(context, `${context.path}[${index}]`);
      const item = readDataProperty(value, String(index), itemContext);
      if (item.status !== 'data') {
        continue;
      }
      const projected = projectSchema(item.value, schema.item, itemContext, depth + 1);
      if (projected !== undefined) {
        output.push(projected);
      }
    }
    return output;
  }
  if (schema.type === 'record') {
    if (!isObjectLike(value)) {
      return undefined;
    }
    const output: Record<string, unknown> = {};
    for (const [key, fieldSchema] of Object.entries(schema.fields)) {
      const fieldContext = childContext(context, `${context.path}.${key}`);
      const field = readDataProperty(value, key, fieldContext);
      if (field.status !== 'data') {
        continue;
      }
      const projected = projectSchema(field.value, fieldSchema, fieldContext, depth + 1);
      if (projected !== undefined) {
        output[key] = projected;
      }
    }
    return output;
  }
  if (schema.type === 'map') {
    if (!isObjectLike(value)) {
      return undefined;
    }
    const output = {};
    for (const key of safeOwnKeys(value, context)) {
      const entryContext = childContext(context, `${context.path}.entry`);
      const entry = readDataProperty(value, key, entryContext);
      if (entry.status !== 'data') {
        continue;
      }
      const projected = projectSchema(entry.value, schema.value, entryContext, depth + 1);
      if (projected !== undefined) {
        defineSafe(output, key.slice(0, context.limits.maxStringLength), projected);
      }
    }
    return output;
  }
  return undefined;
}
