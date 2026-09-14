<?php

declare(strict_types=1);

final class Database
{
    private static ?mysqli $conn = null;

    public static function connection(): mysqli
    {
        if (self::$conn instanceof mysqli) {
            return self::$conn;
        }

        $cfg = require dirname(__DIR__) . '/config/database.php';
        mysqli_report(MYSQLI_REPORT_ERROR | MYSQLI_REPORT_STRICT);

        $conn = new mysqli(
            $cfg['host'],
            $cfg['user'],
            $cfg['pass'],
            $cfg['name'],
            $cfg['port']
        );
        $conn->set_charset($cfg['charset']);
        self::$conn = $conn;
        return self::$conn;
    }

    public static function begin(): void
    {
        self::connection()->begin_transaction();
    }

    public static function commit(): void
    {
        self::connection()->commit();
    }

    public static function rollback(): void
    {
        if (self::$conn instanceof mysqli) {
            self::$conn->rollback();
        }
    }
}
