import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  defaultRouteHost,
  renderCaddyConfig,
  renderReverseProxyBlock,
  renderCustomDomainRoute,
  renderDefaultRoute,
} from '../caddy.js';

test('default route host composes app org and host', () => {
  assert.equal(
    defaultRouteHost({ host: 'edge-a', org: 'Acme', app: 'Store Front' }),
    'store-front.acme.edge-a',
  );
});

test('render default route block', () => {
  const block = renderDefaultRoute({
    host: 'edge-a',
    org: 'acme',
    app: 'shop',
    upstream: '127.0.0.1:3100',
  });
  assert.equal(block, 'shop.acme.edge-a {\n  reverse_proxy 127.0.0.1:3100\n}');
});

test('render custom domain route block', () => {
  const block = renderCustomDomainRoute({
    domain: 'Shop.example.com',
    upstream: '127.0.0.1:3100',
  });
  assert.equal(block, 'shop.example.com {\n  reverse_proxy 127.0.0.1:3100\n}');
});

test('render complete caddy config', () => {
  const config = renderCaddyConfig({
    host: 'edge-a',
    org: 'acme',
    app: 'shop',
    upstream: '127.0.0.1:3100',
    customDomains: ['shop.example.com', 'www.shop.example.com'],
  });
  assert.equal(
    config,
    [
      'shop.acme.edge-a {\n  reverse_proxy 127.0.0.1:3100\n}',
      'shop.example.com {\n  reverse_proxy 127.0.0.1:3100\n}',
      'www.shop.example.com {\n  reverse_proxy 127.0.0.1:3100\n}',
    ].join('\n\n') + '\n',
  );
});

test('reverse proxy block validates required fields', () => {
  assert.throws(() => renderReverseProxyBlock({ domain: '', upstream: '127.0.0.1:3000' }), /domain is required/);
  assert.throws(() => renderReverseProxyBlock({ domain: 'shop.example.com', upstream: '' }), /upstream is required/);
});
