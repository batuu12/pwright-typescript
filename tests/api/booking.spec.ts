import { test, expect } from '@playwright/test';
import { BookingClient } from '../../src/api/BookingClient';
import { createBookingPayload } from '../../src/data/bookingData';

test.describe('Restful Booker API', () => {
  let client: BookingClient;

  test.beforeEach(async ({ request }) => {
    client = new BookingClient(request);
  });

  test('GET /booking - returns list of booking IDs', async () => {
    const bookings = await client.getAllBookingIds();
    expect(bookings.length).toBeGreaterThan(0);
    expect(bookings[0]).toHaveProperty('bookingid');
  });

  test('POST /auth - returns auth token', async () => {
    const token = await client.getToken();
    expect(token).toBeTruthy();
    expect(typeof token).toBe('string');
  });

  test('POST /booking - creates a new booking', async () => {
    const payload = createBookingPayload();
    const { bookingid, booking } = await client.createBooking(payload);

    expect(bookingid).toBeDefined();
    expect(booking.firstname).toBe(payload.firstname);
    expect(booking.lastname).toBe(payload.lastname);
    expect(booking.totalprice).toBe(payload.totalprice);
    expect(booking.depositpaid).toBe(payload.depositpaid);
    expect(booking.bookingdates.checkin).toBe(payload.bookingdates.checkin);
    expect(booking.bookingdates.checkout).toBe(payload.bookingdates.checkout);
  });

  test('GET /booking/:id - returns booking by ID', async () => {
    const payload = createBookingPayload();
    const { bookingid } = await client.createBooking(payload);
    const booking = await client.getBooking(bookingid);

    expect(booking.firstname).toBe(payload.firstname);
    expect(booking.lastname).toBe(payload.lastname);
    expect(booking.totalprice).toBe(payload.totalprice);
  });

  test('PUT /booking/:id - fully updates a booking', async () => {
    const payload = createBookingPayload();
    const { bookingid } = await client.createBooking(payload);
    const token = await client.getToken();

    const updated = createBookingPayload({ firstname: 'Jane', lastname: 'Smith', totalprice: 300 });
    const result = await client.updateBooking(bookingid, updated, token);

    expect(result.firstname).toBe('Jane');
    expect(result.lastname).toBe('Smith');
    expect(result.totalprice).toBe(300);
  });

  test('PATCH /booking/:id - partially updates a booking', async () => {
    const payload = createBookingPayload();
    const { bookingid } = await client.createBooking(payload);
    const token = await client.getToken();

    const result = await client.partialUpdateBooking(bookingid, { firstname: 'Updated', totalprice: 999 }, token);

    expect(result.firstname).toBe('Updated');
    expect(result.totalprice).toBe(999);
    expect(result.lastname).toBe(payload.lastname);
  });

  test('DELETE /booking/:id - deletes a booking', async () => {
    const payload = createBookingPayload();
    const { bookingid } = await client.createBooking(payload);
    const token = await client.getToken();

    await client.deleteBooking(bookingid, token);

    const status = await client.getBookingStatus(bookingid);
    expect(status).toBe(404);
  });

  test('GET /booking/:id - wrong id returns 404 - intentional fail', async () => {
    const booking = await client.getBooking(999999999);
    expect(booking.firstname).toBe('Wrong Name');
  });

  test.skip('POST /booking - skipped: depositpaid false not yet supported', async () => {
    const payload = createBookingPayload({ depositpaid: false });
    const { booking } = await client.createBooking(payload);
    expect(booking.depositpaid).toBe(false);
  });

  test.skip('DELETE /booking/:id - skipped: bulk delete not implemented', async () => {
    const token = await client.getToken();
    await client.deleteBooking(1, token);
    await client.deleteBooking(2, token);
  });
});
