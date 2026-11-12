import { describe, expect, it } from 'vitest';
import { validate } from './useCheckinForm.js';
import { todayIso } from '../../lib/format.js';

const ok = {
  airport: { iata: 'GOT' },
  visitedOn: todayIso(),
  comment: '',
  travel: { flightNumber: '', loungeChoice: '', newLounge: { name: '' } }
};

describe('validate', () => {
  it('godkänner ett minimalt formulär', () => expect(validate(ok)).toEqual({}));
  it('kräver flygplats och datum utan framtid', () => {
    expect(validate({ ...ok, airport: null }).airport).toBeTruthy();
    expect(validate({ ...ok, visitedOn: '2999-01-01' }).visitedOn).toMatch(/framtiden/);
    expect(validate({ ...ok, visitedOn: '' }).visitedOn).toBeTruthy();
  });
  it('kontrollerar flightnummer, kommentar och ny lounge', () => {
    expect(validate({ ...ok, travel: { ...ok.travel, flightNumber: 'S' } }).flightNumber).toBeTruthy();
    expect(validate({ ...ok, travel: { ...ok.travel, flightNumber: 'SK1421' } }).flightNumber).toBeUndefined();
    expect(validate({ ...ok, comment: 'x'.repeat(1001) }).comment).toBeTruthy();
    expect(validate({ ...ok, travel: { ...ok.travel, loungeChoice: 'new' } }).newLounge).toBeTruthy();
  });
});
