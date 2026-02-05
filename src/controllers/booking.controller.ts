import { Response } from "express";
import { z } from "zod";
import prisma from "../lib/prisma";
import { AuthRequest } from "../middleware/auth.middleware";

const createBookingSchema = z.object({
  listingId: z.string().uuid(),
  checkIn: z.string().datetime(),
  checkOut: z.string().datetime(),
  guests: z.number().int().positive(),
});

const hasOverlappingBooking = async (
  listingId: string,
  checkIn: Date,
  checkOut: Date,
  excludeBookingId?: string,
) => {
  const overlappingBooking = await prisma.booking.findFirst({
    where: {
      listingId,
      status: {
        in: ["PENDING", "CONFIRMED"],
      },
      AND: [
        {
          checkIn: {
            lt: checkOut,
          },
        },
        {
          checkOut: {
            gt: checkIn,
          },
        },
      ],
      ...(excludeBookingId && {
        id: {
          not: excludeBookingId,
        },
      }),
    },
  });

  return !!overlappingBooking;
};

export const createBooking = async (req: AuthRequest, res: Response) => {
  try {
    const data = createBookingSchema.parse(req.body);
    const checkIn = new Date(data.checkIn);
    const checkOut = new Date(data.checkOut);

    if (checkIn >= checkOut) {
      return res
        .status(400)
        .json({ error: "Check-out must be after check-in" });
    }

    if (checkIn < new Date()) {
      return res
        .status(400)
        .json({ error: "Check-in date cannot be in the past" });
    }

    const listing = await prisma.listing.findUnique({
      where: { id: data.listingId },
    });

    if (!listing) {
      return res.status(404).json({ error: "Listing not found" });
    }

    if (data.guests > listing.maxGuests) {
      return res.status(400).json({
        error: `Maximum guests allowed: ${listing.maxGuests}`,
      });
    }

    const hasOverlap = await hasOverlappingBooking(
      data.listingId,
      checkIn,
      checkOut,
    );

    if (hasOverlap) {
      return res.status(409).json({
        error: "This listing is already booked for the selected dates",
      });
    }

    const nights = Math.ceil(
      (checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60 * 24),
    );
    const totalPrice = nights * listing.price;

    const booking = await prisma.booking.create({
      data: {
        userId: req.userId!,
        listingId: data.listingId,
        checkIn,
        checkOut,
        guests: data.guests,
        totalPrice,
        status: "CONFIRMED",
      },
      include: {
        listing: {
          select: {
            id: true,
            title: true,
            city: true,
            address: true,
            images: true,
          },
        },
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
    });

    res.status(201).json({
      message: "Booking created successfully",
      booking,
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: "Validation failed",
        fieldErrors: error.flatten().fieldErrors,
      });
    }
    res.status(500).json({ error: error.message });
  }
};

export const getMyBookings = async (req: AuthRequest, res: Response) => {
  try {
    const bookings = await prisma.booking.findMany({
      where: {
        userId: req.userId!,
      },
      include: {
        listing: {
          select: {
            id: true,
            title: true,
            city: true,
            address: true,
            images: true,
            host: {
              select: {
                firstName: true,
                lastName: true,
                phone: true,
                email: true,
              },
            },
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    res.json({ bookings });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const getBookingById = async (req: AuthRequest, res: Response) => {
  try {
    const id = req.params.id as string; // safe: route param :id is always string

    const booking = await prisma.booking.findUnique({
      where: { id },
      include: {
        listing: {
          include: {
            host: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                phone: true,
                email: true,
              },
            },
          },
        },
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
    });

    if (!booking) {
      return res.status(404).json({ error: "Booking not found" });
    }

    if (
      booking.userId !== req.userId &&
      booking.listing.hostId !== req.userId
    ) {
      return res
        .status(403)
        .json({ error: "Not authorized to view this booking" });
    }

    res.json({ booking });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const cancelBooking = async (req: AuthRequest, res: Response) => {
  try {
    const id = req.params.id as string;

    const booking = await prisma.booking.findUnique({
      where: { id },
      include: {
        listing: {
          select: {
            hostId: true,
            title: true,
          },
        },
      },
    });

    if (!booking) {
      return res.status(404).json({ error: "Booking not found" });
    }

    if (booking.userId !== req.userId) {
      return res
        .status(403)
        .json({ error: "Not authorized to cancel this booking" });
    }

    if (booking.status === "CANCELLED") {
      return res.status(400).json({ error: "Booking is already cancelled" });
    }

    if (booking.status === "COMPLETED") {
      return res.status(400).json({ error: "Cannot cancel completed booking" });
    }

    const updatedBooking = await prisma.booking.update({
      where: { id },
      data: {
        status: "CANCELLED",
      },
      include: {
        listing: {
          select: {
            title: true,
          },
        },
      },
    });

    res.json({
      message: "Booking cancelled successfully",
      booking: updatedBooking,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};
