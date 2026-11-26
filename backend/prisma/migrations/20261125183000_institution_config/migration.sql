-- Configuración institucional persistente y zona horaria configurable.
CREATE TABLE "InstitutionConfig" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT DEFAULT 1,
    "name" TEXT NOT NULL,
    "timeZone" TEXT NOT NULL DEFAULT 'America/Mexico_City',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

INSERT INTO "InstitutionConfig" ("id", "name", "timeZone", "updatedAt")
VALUES (1, 'Hospital General', 'America/Mexico_City', CURRENT_TIMESTAMP);
