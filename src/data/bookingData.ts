import { Booking } from '../api/BookingClient';

export const createBookingPayload = (overrides: Partial<Booking> = {}): Booking => ({
  firstname: 'John',
  lastname: 'Doe',
  totalprice: 150,
  depositpaid: true,
  bookingdates: {
    checkin: '2026-04-01',
    checkout: '2026-04-05',
  },
  additionalneeds: 'Breakfast',
  ...overrides,
});
