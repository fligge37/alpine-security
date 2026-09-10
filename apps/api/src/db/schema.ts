import { pgTable, uuid, text, timestamp, numeric, customType } from 'drizzle-orm/pg-core';

const geographyPoint = customType<{ data: string }>({
  dataType() {
    return 'geography(Point, 4326)';
  },
});

export const region = pgTable('region', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const appUser = pgTable('app_user', {
  id: uuid('id').primaryKey().defaultRandom(),
  phoneNumber: text('phone_number').notNull().unique(),
  phoneVerifiedAt: timestamp('phone_verified_at', { withTimezone: true }),
  displayName: text('display_name'),
  emergencyContactName: text('emergency_contact_name'),
  emergencyContactPhone: text('emergency_contact_phone'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const rescueOrgMember = pgTable('rescue_org_member', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  displayName: text('display_name').notNull(),
  regionId: uuid('region_id')
    .notNull()
    .references(() => region.id),
  verifiedAt: timestamp('verified_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const tour = pgTable('tour', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => appUser.id),
  status: text('status', { enum: ['aktiv', 'beendet'] })
    .notNull()
    .default('aktiv'),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
  endedAt: timestamp('ended_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const locationPing = pgTable('location_ping', {
  id: uuid('id').primaryKey().defaultRandom(),
  tourId: uuid('tour_id')
    .notNull()
    .references(() => tour.id),
  recordedAt: timestamp('recorded_at', { withTimezone: true }).notNull(),
  receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
  location: geographyPoint('location').notNull(),
  accuracyMeters: numeric('accuracy_meters'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
