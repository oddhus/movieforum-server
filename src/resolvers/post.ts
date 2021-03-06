import { generateStandardError } from "../utils/generateError";
import {
  Arg,
  Ctx,
  FieldResolver,
  Int,
  Mutation,
  Query,
  Resolver,
  Root,
  UseMiddleware,
} from "type-graphql";
import { getConnection } from "typeorm";
import { Post } from "../entities/Post";
import { User } from "../entities/User";
import { isAuth } from "../middleware/isAuth";
import { MyContext } from "../types";
import { CreateAndUpdatePostInput } from "./types/post-input";
import { PaginatedPosts, PostResponse } from "./types/post-response";

@Resolver(Post)
export class PostResolver {
  @FieldResolver(() => String)
  textSnippet(@Root() post: Post) {
    return post.text.slice(0, 50);
  }

  @FieldResolver(() => User)
  creator(@Root() post: Post, @Ctx() { userLoader }: MyContext) {
    return userLoader.load(post.creatorId);
  }

  @Query(() => PaginatedPosts)
  async posts(
    @Arg("limit", () => Int) limit: number,
    @Arg("cursor", () => String, { nullable: true }) cursor: string | null
  ): Promise<PaginatedPosts> {
    // 20 -> 21
    const realLimit = Math.min(50, limit);
    const reaLimitPlusOne = realLimit + 1;

    const replacements: any[] = [reaLimitPlusOne];

    if (cursor) {
      replacements.push(new Date(parseInt(cursor)));
    }

    const posts = await getConnection().query(
      `
    select p.*
    from post p
    ${cursor ? `where p."createdAt" < $2` : ""}
    order by p."createdAt" DESC
    limit $1
    `,
      replacements
    );

    return {
      posts: posts.slice(0, realLimit),
      hasMore: posts.length === reaLimitPlusOne,
    };
  }

  @Query(() => Post, { nullable: true })
  post(@Arg("id", () => Int) id: number): Promise<Post | undefined> {
    return Post.findOne(id);
  }

  @Mutation(() => PostResponse)
  @UseMiddleware(isAuth)
  async createPost(
    @Arg("input") input: CreateAndUpdatePostInput,
    @Ctx() { req }: MyContext
  ): Promise<PostResponse> {
    try {
      const user = await User.findOne(req.session.userId);

      if (!user) {
        return generateStandardError();
      }

      const result = await getConnection()
        .createQueryBuilder()
        .insert()
        .into(Post)
        .values({
          ...input,
          creatorName: `${user.firstname} ${user.lastname}`,
          creatorId: req.session.userId,
        })
        .returning("*")
        .execute();

      return { post: result.raw[0] };
    } catch (error) {
      return generateStandardError(error);
    }
  }

  @Mutation(() => PostResponse)
  @UseMiddleware(isAuth)
  async updatePost(
    @Arg("id", () => Int) id: number,
    @Arg("input") { title, text }: CreateAndUpdatePostInput,
    @Ctx() { req }: MyContext
  ): Promise<PostResponse> {
    try {
      const result = await getConnection()
        .createQueryBuilder()
        .update(Post)
        .set({ title, text })
        .where('id = :id and "creatorId" = :creatorId', {
          id,
          creatorId: req.session.userId,
        })
        .returning("*")
        .execute();

      return result.raw[0];
    } catch (error) {
      return generateStandardError(error);
    }
  }

  @Mutation(() => Boolean)
  @UseMiddleware(isAuth)
  async deletePost(
    @Arg("id", () => Int) id: number,
    @Ctx() { req }: MyContext
  ): Promise<boolean> {
    await Post.delete({ id, creatorId: req.session.userId });
    return true;
  }
}
