import { Field, InputType } from "type-graphql";

@InputType()
export class CreateAndUpdatePostInput {
  @Field()
  title: string;

  @Field()
  text: string;
}
