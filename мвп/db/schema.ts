import {sqliteTable,text,index} from 'drizzle-orm/sqlite-core';
export const records=sqliteTable('workspace_records',{
 key:text('key').primaryKey(),kind:text('kind').notNull(),mode:text('mode').notNull(),userId:text('user_id'),payload:text('payload').notNull(),updatedAt:text('updated_at').notNull(),
},t=>[index('idx_records_kind_mode').on(t.kind,t.mode),index('idx_records_user').on(t.userId)]);
