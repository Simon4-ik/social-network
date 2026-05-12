package sqlite

import (
	"database/sql"
	"errors"
	"fmt"
	"log"

	"github.com/golang-migrate/migrate/v4"
	migsqlite "github.com/golang-migrate/migrate/v4/database/sqlite3"
	_ "github.com/golang-migrate/migrate/v4/source/file"
	_ "github.com/mattn/go-sqlite3"
)

func Open(path string) (*sql.DB, error) {
	db, err := sql.Open("sqlite3", path+"?_foreign_keys=on&_journal_mode=WAL")
	if err != nil {
		return nil, fmt.Errorf("open sqlite: %w", err)
	}
	if err := db.Ping(); err != nil {
		return nil, fmt.Errorf("ping sqlite: %w", err)
	}
	return db, nil
}

func Migrate(db *sql.DB, migrationsURL string) error {
	driver, err := migsqlite.WithInstance(db, &migsqlite.Config{})
	if err != nil {
		return fmt.Errorf("migrate driver: %w", err)
	}
	m, err := migrate.NewWithDatabaseInstance(migrationsURL, "sqlite3", driver)
	if err != nil {
		return fmt.Errorf("migrate instance: %w", err)
	}
	if err := m.Up(); err != nil && !errors.Is(err, migrate.ErrNoChange) {
		return fmt.Errorf("migrate up: %w", err)
	}
	log.Println("migrations applied")
	return nil
}
