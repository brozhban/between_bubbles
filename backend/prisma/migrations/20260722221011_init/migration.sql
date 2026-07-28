/*
  Warnings:

  - Added the required column `birth_date` to the `users` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "currency" AS ENUM ('GEL', 'RUB', 'USD', 'EUR');

-- CreateEnum
CREATE TYPE "wine_type" AS ENUM ('WHITE', 'RED', 'ROSE', 'ORANGE');

-- CreateEnum
CREATE TYPE "sugar_level" AS ENUM ('DRY', 'SEMI_DRY', 'SEMI_SWEET', 'SWEET');

-- CreateEnum
CREATE TYPE "body" AS ENUM ('LIGHT', 'MEDIUM', 'FULL');

-- CreateEnum
CREATE TYPE "acidity" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "tannins" AS ENUM ('GREEN', 'ROUGH', 'VELVET', 'SILKY', 'AGGRESSIVE', 'NOT_APPLICABLE');

-- CreateEnum
CREATE TYPE "aftertaste" AS ENUM ('BALANCED', 'LIGHT', 'RICH', 'HEAVY');

-- CreateEnum
CREATE TYPE "taste_category" AS ENUM ('I', 'II', 'III', 'IV', 'V', 'VI');

-- CreateEnum
CREATE TYPE "photo_kind" AS ENUM ('BOTTLE', 'LABEL');

-- CreateEnum
CREATE TYPE "store_kind" AS ENUM ('SUPERMARKET', 'WINE_SHOP', 'RESTAURANT', 'BAR', 'ONLINE', 'OTHER');

-- CreateEnum
CREATE TYPE "store_status" AS ENUM ('ACTIVE', 'HIDDEN', 'MERGED');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "avatar_key" TEXT,
ADD COLUMN     "birth_date" DATE NOT NULL,
ADD COLUMN     "default_currency" "currency" NOT NULL DEFAULT 'GEL',
ADD COLUMN     "deleted_at" TIMESTAMP(3),
ADD COLUMN     "email_verified_at" TIMESTAMP(3),
ADD COLUMN     "locale" TEXT NOT NULL DEFAULT 'ru',
ADD COLUMN     "show_spend_totals" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "terms_accepted_at" TIMESTAMP(3),
ADD COLUMN     "terms_version" TEXT,
ADD COLUMN     "theme" TEXT NOT NULL DEFAULT 'system',
ADD COLUMN     "timezone" TEXT NOT NULL DEFAULT 'Asia/Tbilisi';

-- CreateTable
CREATE TABLE "weeks" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "user_id" UUID NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "iso_year" INTEGER NOT NULL,
    "iso_week" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "weeks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wines" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "user_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "producer" TEXT,
    "origin_country" CHAR(2),
    "region" TEXT,
    "grapes" TEXT[],
    "vintage" INTEGER,
    "abv" DECIMAL(3,1),
    "type" "wine_type" NOT NULL,
    "sugar" "sugar_level",
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tasting_entries" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "user_id" UUID NOT NULL,
    "wine_id" UUID NOT NULL,
    "week_id" UUID NOT NULL,
    "tasted_on" DATE NOT NULL,
    "volume_ml" INTEGER NOT NULL,
    "rating" DECIMAL(2,1) NOT NULL,
    "price" DECIMAL(12,2),
    "currency" "currency",
    "purchase_country" CHAR(2),
    "store_id" UUID,
    "body" "body",
    "acidity" "acidity",
    "tannins" "tannins",
    "taste_category" "taste_category",
    "aftertaste" "aftertaste",
    "notes" TEXT,
    "same_bottle_of_id" UUID,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tasting_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "entry_aromas" (
    "entry_id" UUID NOT NULL,
    "tag_id" UUID NOT NULL,

    CONSTRAINT "entry_aromas_pkey" PRIMARY KEY ("entry_id","tag_id")
);

-- CreateTable
CREATE TABLE "aroma_tags" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "user_id" UUID,
    "name_ru" TEXT NOT NULL,
    "name_en" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "aroma_tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "entry_photos" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "entry_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "kind" "photo_kind" NOT NULL,
    "storage_key" TEXT NOT NULL,
    "thumb_key" TEXT NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "mime_type" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "entry_photos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stores" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "name" TEXT NOT NULL,
    "normalized_name" TEXT NOT NULL,
    "country_code" CHAR(2) NOT NULL,
    "city" TEXT,
    "kind" "store_kind" NOT NULL DEFAULT 'OTHER',
    "status" "store_status" NOT NULL DEFAULT 'ACTIVE',
    "merged_into_id" UUID,
    "usage_count" INTEGER NOT NULL DEFAULT 0,
    "created_by_user_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_store_recents" (
    "user_id" UUID NOT NULL,
    "store_id" UUID NOT NULL,
    "use_count" INTEGER NOT NULL DEFAULT 1,
    "last_used" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_store_recents_pkey" PRIMARY KEY ("user_id","store_id")
);

-- CreateTable
CREATE TABLE "share_links" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "entry_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "show_name" BOOLEAN NOT NULL DEFAULT false,
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "share_links_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "weeks_user_id_start_date_idx" ON "weeks"("user_id", "start_date");

-- CreateIndex
CREATE UNIQUE INDEX "weeks_user_id_start_date_key" ON "weeks"("user_id", "start_date");

-- CreateIndex
CREATE INDEX "wines_user_id_name_idx" ON "wines"("user_id", "name");

-- CreateIndex
CREATE INDEX "tasting_entries_user_id_tasted_on_idx" ON "tasting_entries"("user_id", "tasted_on");

-- CreateIndex
CREATE INDEX "tasting_entries_user_id_week_id_idx" ON "tasting_entries"("user_id", "week_id");

-- CreateIndex
CREATE INDEX "tasting_entries_wine_id_idx" ON "tasting_entries"("wine_id");

-- CreateIndex
CREATE INDEX "tasting_entries_user_id_deleted_at_idx" ON "tasting_entries"("user_id", "deleted_at");

-- CreateIndex
CREATE INDEX "entry_aromas_tag_id_idx" ON "entry_aromas"("tag_id");

-- CreateIndex
CREATE INDEX "aroma_tags_user_id_idx" ON "aroma_tags"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "aroma_tags_user_id_name_ru_key" ON "aroma_tags"("user_id", "name_ru");

-- CreateIndex
CREATE INDEX "entry_photos_entry_id_idx" ON "entry_photos"("entry_id");

-- CreateIndex
CREATE INDEX "entry_photos_user_id_idx" ON "entry_photos"("user_id");

-- CreateIndex
CREATE INDEX "stores_country_code_usage_count_idx" ON "stores"("country_code", "usage_count");

-- CreateIndex
CREATE INDEX "stores_created_by_user_id_created_at_idx" ON "stores"("created_by_user_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "stores_normalized_name_country_code_city_key" ON "stores"("normalized_name", "country_code", "city");

-- CreateIndex
CREATE INDEX "user_store_recents_user_id_last_used_idx" ON "user_store_recents"("user_id", "last_used");

-- CreateIndex
CREATE UNIQUE INDEX "share_links_slug_key" ON "share_links"("slug");

-- CreateIndex
CREATE INDEX "share_links_entry_id_idx" ON "share_links"("entry_id");

-- CreateIndex
CREATE INDEX "share_links_user_id_idx" ON "share_links"("user_id");

-- CreateIndex
CREATE INDEX "users_deleted_at_idx" ON "users"("deleted_at");

-- AddForeignKey
ALTER TABLE "weeks" ADD CONSTRAINT "weeks_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wines" ADD CONSTRAINT "wines_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasting_entries" ADD CONSTRAINT "tasting_entries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasting_entries" ADD CONSTRAINT "tasting_entries_wine_id_fkey" FOREIGN KEY ("wine_id") REFERENCES "wines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasting_entries" ADD CONSTRAINT "tasting_entries_week_id_fkey" FOREIGN KEY ("week_id") REFERENCES "weeks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasting_entries" ADD CONSTRAINT "tasting_entries_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasting_entries" ADD CONSTRAINT "tasting_entries_same_bottle_of_id_fkey" FOREIGN KEY ("same_bottle_of_id") REFERENCES "tasting_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entry_aromas" ADD CONSTRAINT "entry_aromas_entry_id_fkey" FOREIGN KEY ("entry_id") REFERENCES "tasting_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entry_aromas" ADD CONSTRAINT "entry_aromas_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "aroma_tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aroma_tags" ADD CONSTRAINT "aroma_tags_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entry_photos" ADD CONSTRAINT "entry_photos_entry_id_fkey" FOREIGN KEY ("entry_id") REFERENCES "tasting_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entry_photos" ADD CONSTRAINT "entry_photos_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stores" ADD CONSTRAINT "stores_merged_into_id_fkey" FOREIGN KEY ("merged_into_id") REFERENCES "stores"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_store_recents" ADD CONSTRAINT "user_store_recents_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_store_recents" ADD CONSTRAINT "user_store_recents_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "share_links" ADD CONSTRAINT "share_links_entry_id_fkey" FOREIGN KEY ("entry_id") REFERENCES "tasting_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "share_links" ADD CONSTRAINT "share_links_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
