import { fastify, FastifyInstance } from "fastify";
import mercurius from "mercurius";
import ormConfig from "orm.config";
import fastifySession from "fastify-session";
import fastifyCors from "fastify-cors";
import fastifyCookie from "fastify-cookie";
import { Connection, IDatabaseDriver, MikroORM } from "@mikro-orm/core";
import { IncomingMessage, Server, ServerResponse } from "http";
import { Constants, Redis, Session } from "utils";
import { createSchema } from "utils/schema";

export default class Application {
  public orm: MikroORM<IDatabaseDriver<Connection>>;
  public host: FastifyInstance<Server, IncomingMessage, ServerResponse>;

  public connect = async (): Promise<void> => {
    try {
      this.orm = await MikroORM.init(ormConfig);
      const migrator = this.orm.getMigrator();
      const migrations = await migrator.getPendingMigrations();
      if (migrations && migrations.length > 0) {
        await migrator.up();
      }
    } catch (error) {
      console.log("[💬] Error - Unable to connect to database", error);
      throw Error(error);
    }
  };

  public init = async (): Promise<void> => {
    this.host = fastify({
      logger: {
        prettyPrint: !Constants.__prod__,
      },
      trustProxy: Constants.__prod__ ? 1 : 0,
    });

    this.host.register(fastifyCors, { origin: true, credentials: true }); // TODO - Fix this in future for multiple targets.
    this.host.register(fastifyCookie);
    this.host.register(fastifySession, Session.config);

    try {
      const schema = await createSchema();

      this.host.register(mercurius, {
        schema,
        context: (request, reply) => ({
          request,
          reply,
          redis: Redis(),
          em: this.orm.em.fork(),
        }),
        graphiql: Constants.__prod__ ? false : "playground",
        jit: 1,
      });

      const PORT = process.env.PORT || 4000;

      this.host.listen(PORT, "0.0.0.0", () => {
        console.log("[💬] Server Launched!");
      });
    } catch (error) {
      console.log("[💬] Error - Unable to start server!", error);
      throw Error(error);
    }
  };
}
