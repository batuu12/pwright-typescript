import { APIRequestContext, expect } from '@playwright/test';

const API_URL = 'https://restful-booker.herokuapp.com';

export interface BookingDates {
  checkin: string;
  checkout: string;
}

export interface Booking {
  firstname: string;
  lastname: string;
  totalprice: number;
  depositpaid: boolean;
  bookingdates: BookingDates;
  additionalneeds?: string;
}

export interface CreatedBooking {
  bookingid: number;
  booking: Booking;
}

export class BookingClient {
  constructor(private request: APIRequestContext) {}

  async getToken(): Promise<string> {
    const response = await this.request.post(`${API_URL}/auth`, {
      data: { username: 'admin', password: 'password123' },
    });
    expect(response.status()).toBe(200);
    const body = await response.json();
    return body.token;
  }

  async getAllBookingIds(): Promise<{ bookingid: number }[]> {
    const response = await this.request.get(`${API_URL}/booking`);
    expect(response.status()).toBe(200);
    return response.json();
  }

  async getBooking(id: number): Promise<Booking> {
    const response = await this.request.get(`${API_URL}/booking/${id}`);
    expect(response.status()).toBe(200);
    return response.json();
  }

  async createBooking(booking: Booking): Promise<CreatedBooking> {
    const response = await this.request.post(`${API_URL}/booking`, { data: booking });
    expect(response.status()).toBe(200);
    return response.json();
  }

  async updateBooking(id: number, booking: Booking, token: string): Promise<Booking> {
    const response = await this.request.put(`${API_URL}/booking/${id}`, {
      data: booking,
      headers: { Cookie: `token=${token}` },
    });
    expect(response.status()).toBe(200);
    return response.json();
  }

  async partialUpdateBooking(id: number, data: Partial<Booking>, token: string): Promise<Booking> {
    const response = await this.request.patch(`${API_URL}/booking/${id}`, {
      data,
      headers: { Cookie: `token=${token}` },
    });
    expect(response.status()).toBe(200);
    return response.json();
  }

  async deleteBooking(id: number, token: string): Promise<number> {
    const response = await this.request.delete(`${API_URL}/booking/${id}`, {
      headers: { Cookie: `token=${token}` },
    });
    expect(response.status()).toBe(201);
    return id;
  }

  async getBookingStatus(id: number): Promise<number> {
    const response = await this.request.get(`${API_URL}/booking/${id}`);
    return response.status();
  }
}
