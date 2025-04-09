declare module "anylist" {
  export interface AnyListOptions {
    email: string;
    password: string;
  }

  export interface Ingredient {
    rawIngredient: string;
    name: string;
    quantity: string;
    note: string;
  }

  export interface Recipe {
    identifier: string;
    timestamp: string;
    name: string;
    note: string;
    sourceName: string;
    sourceUrl: string;
    ingredients: Ingredient[];
    preparationSteps: string[];
    photoIds: string[];
    photoUrls: string[];
    scaleFactor: number;
    rating: number;
    creationTimestamp: string;
    nutritionalInfo: string;
    cookTime: number;
    prepTime: number;
    servings: string;
  }

  export class AnyList {
    constructor(options: AnyListOptions);
    login(): Promise<void>;
    teardown(): Promise<void>;
    getRecipes(): Promise<Recipe[]>;
  }
}
