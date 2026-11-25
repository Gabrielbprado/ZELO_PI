-- O inbox de notificações mudou-se para o microserviço (services/notifications),
-- no schema `notifications`. A tabela e o enum deixam de existir aqui no `public`:
-- o backend agora é apenas o gateway que lê o inbox por HTTP.
DROP TABLE "Notification";

DROP TYPE "NotificationType";
