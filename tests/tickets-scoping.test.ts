import { describe, it, expect } from 'vitest';
import { ticketsKeyFor } from '../src/features/support/hooks/useCustomerTickets';

describe('ticketsKeyFor (Loop 35/120)', () => {
  it('scopes drafts per user id', () => {
    expect(ticketsKeyFor('u1')).toBe('burgonomics_customer_tickets:u1');
    expect(ticketsKeyFor('u2')).toBe('burgonomics_customer_tickets:u2');
    expect(ticketsKeyFor('u1')).not.toBe(ticketsKeyFor('u2'));
  });

  it('keeps guests on the legacy key without migrating anyone', () => {
    expect(ticketsKeyFor(null)).toBe('burgonomics_customer_tickets');
    expect(ticketsKeyFor(undefined)).toBe('burgonomics_customer_tickets');
  });
});
