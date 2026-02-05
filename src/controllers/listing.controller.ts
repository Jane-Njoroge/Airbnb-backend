import { Response } from "express";
import { z } from "zod";
import prisma from "../lib/prisma";
import { AuthRequest } from "../middleware/auth.middleware";

const createListingSchema = z.object({
  title: z.string().min(5),
  description: z.string().min(20),
  city: z.string().min(2),
  address: z.string().min(5),
  price: z.number().positive(),
  bedrooms: z.number().int().positive(),
  bathrooms: z.number().int().positive(),
  maxGuests: z.number().int().positive(),
  images: z.array(z.string().url()),
  amenities: z.array(z.string()),
});

export const createListing = async (req: AuthRequest, res: Response) => {
  try {
    const data = createListingSchema.parse(req.body);

    const listing = await prisma.listing.create({
      data: {
        ...data,
        hostId: req.userId!,
      },
      include: {
        host: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            avatar: true,
          },
        },
      },
    });

    res.status(201).json({
      message: "Listing created successfully",
      listing,
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

export const getAllListings = async (req: AuthRequest, res: Response) => {
  try {
    const { city, minPrice, maxPrice, guests } = req.query;

    const where: any = {};

    if (city) {
      where.city = {
        contains: city as string,
        mode: "insensitive",
      };
    }

    if (minPrice || maxPrice) {
      where.price = {};
      if (minPrice) where.price.gte = parseFloat(minPrice as string);
      if (maxPrice) where.price.lte = parseFloat(maxPrice as string);
    }

    if (guests) {
      where.maxGuests = {
        gte: parseInt(guests as string, 10),
      };
    }

    const listings = await prisma.listing.findMany({
      where,
      include: {
        host: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            avatar: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    res.json({ listings });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const getListingById = async (req: AuthRequest, res: Response) => {
  try {
    const id = req.params.id as string; // safe assertion – route ensures :id exists

    const listing = await prisma.listing.findUnique({
      where: { id },
      include: {
        host: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
            avatar: true,
          },
        },
        bookings: {
          where: {
            status: {
              in: ["CONFIRMED", "PENDING"],
            },
          },
          select: {
            checkIn: true,
            checkOut: true,
          },
        },
      },
    });

    if (!listing) {
      return res.status(404).json({ error: "Listing not found" });
    }

    res.json({ listing });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const getMyListings = async (req: AuthRequest, res: Response) => {
  try {
    const listings = await prisma.listing.findMany({
      where: {
        hostId: req.userId!,
      },
      include: {
        bookings: {
          select: {
            id: true,
            checkIn: true,
            checkOut: true,
            status: true,
            user: {
              select: {
                firstName: true,
                lastName: true,
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

    res.json({ listings });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const updateListing = async (req: AuthRequest, res: Response) => {
  try {
    const id = req.params.id as string;
    const data = createListingSchema.partial().parse(req.body);

    const existingListing = await prisma.listing.findUnique({
      where: { id },
    });

    if (!existingListing) {
      return res.status(404).json({ error: "Listing not found" });
    }

    if (existingListing.hostId !== req.userId) {
      return res
        .status(403)
        .json({ error: "Not authorized to update this listing" });
    }

    const listing = await prisma.listing.update({
      where: { id },
      data,
      include: {
        host: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            avatar: true,
          },
        },
      },
    });

    res.json({
      message: "Listing updated successfully",
      listing,
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

export const deleteListing = async (req: AuthRequest, res: Response) => {
  try {
    const id = req.params.id as string;

    const listing = await prisma.listing.findUnique({
      where: { id },
    });

    if (!listing) {
      return res.status(404).json({ error: "Listing not found" });
    }

    if (listing.hostId !== req.userId) {
      return res
        .status(403)
        .json({ error: "Not authorized to delete this listing" });
    }

    await prisma.listing.delete({
      where: { id },
    });

    res.json({ message: "Listing deleted successfully" });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};
