import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { PrismaClientKnownRequestError } from "@prisma/client/runtime/library";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const publicOnly = searchParams.get('publicOnly') === 'true';
        // ✅ 新增：检查是否登录
    const session = await getServerSession(authOptions);
    const isAdmin = !!session;

    // ✅ 修改 where 条件：登录就查所有，未登录才按参数过滤
    const collections = await prisma.collection.findMany({
      where: isAdmin ? {} : (publicOnly ? { isPublic: true } : { isPublic: true }),
      orderBy: {
        sortOrder: "asc"
      }
    });

    // Return data structure:
    // An array of collection objects with the following properties:
    // {
    //   id: string,           // Unique identifier of the collection
    //   name: string,         // Name of the collection
    //   description?: string, // Optional description of the collection
    //   icon?: string,        // Optional icon for the collection
    //   isPublic: boolean,    // Indicates if the collection is publicly visible
    //   viewStyle: string,    // Display style of the collection
    //   sortStyle: string,    // Sorting method for items in the collection
    //   sortOrder: number,    // Numerical order for sorting collections
    //   slug: string,         // URL-friendly name of the collection
    //   totalBookmarks: number // Total number of bookmarks in the collection
    // }
    const collectionsWithBookmarkCount = await Promise.all(
      collections.map(async (collection) => {
        const folders = await prisma.folder.findMany({
          where: {
            collectionId: collection.id
          },
          select: {
            id: true
          }
        });

        const folderIds = folders.map(folder => folder.id);

        const totalBookmarks = await prisma.bookmark.count({
          where: {
            collectionId: collection.id,
            OR: [
              { folderId: null },
              { folderId: { in: folderIds } }
            ]
          }
        });

        return {
          ...collection,
          totalBookmarks
        };
      })
    );

    return NextResponse.json(collectionsWithBookmarkCount);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Failed to get bookmark collections" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);

    if (!session) {
      return NextResponse.json(
        { error: "Unauthorized access" },
        { status: 401 }
      );
    }

    const body = await request.json();

    // ✅ 新增：处理导入逻辑
    // 如果 body 里有 bookmarks 数组，说明是导入请求
    if (body.bookmarks && Array.isArray(body.bookmarks)) {
      const collectionName = body.name || "Imported Collection";

      // 1. 查找是否已有该名字的集合，没有则创建一个
      let collection = await prisma.collection.findFirst({
        where: { name: collectionName }
      });

      if (!collection) {
        collection = await prisma.collection.create({
          data: {
            name: collectionName,
            slug: collectionName.toLowerCase().replace(/\s+/g, '-'),
            description: "",
            icon: "",
            isPublic: true, // 默认公开
            viewStyle: "list",
            sortStyle: "alpha",
            sortOrder: 0
          },
        });
      }

      // 2. 准备要插入的书签数据
      const bookmarksToCreate = body.bookmarks.map((b: any) => ({
        title: b.title || b.name || "Untitled", // 兼容不同字段名
        url: b.url,
        description: b.description || "",
        icon: b.icon || "",
        collectionId: collection.id,
        folderId: null, // 默认都在根目录
      }));

      // 3. 批量插入数据库 (跳过重复的 URL)
      // 注意：如果书签非常多（几千个），建议分批插入
      await prisma.bookmark.createMany({
        data: bookmarksToCreate,
        skipDuplicates: true 
      });

      return NextResponse.json({ 
        success: true, 
        message: `Successfully imported ${bookmarksToCreate.length} bookmarks` 
      });
    }

    // ✅ 原有：处理创建新集合的逻辑
    const { name, description, icon, isPublic, viewStyle, sortStyle, sortOrder } = body;
    const slug = name ? name.toLowerCase().replace(/\s+/g, '-') : "";

    // 检查名称是否已存在
    if (name) {
      const existingCollection = await prisma.collection.findFirst({
        where: {
          OR: [{ name }, { slug }]
        }
      });

      if (existingCollection) {
        return NextResponse.json(
          { error: "The name or slug is already in use" },
          { status: 400 }
        );
      }
    }

    // 创建新集合
    const collection = await prisma.collection.create({
      data: {
        name: name || "",
        description: description || "",
        icon: icon || "",
        isPublic: isPublic ?? true,
        viewStyle: viewStyle || "list",
        sortStyle: sortStyle || "alpha",
        sortOrder: sortOrder ?? 0,
        slug,
      },
    });

    return NextResponse.json(collection);
  } catch (error: unknown) {
    console.error("Detailed error:", error);
    return NextResponse.json(
      { error: `Failed to process request: ${error instanceof Error ? error.message : 'Unknown error'}` },
      { status: 500 }
    );
  }
}

// // 检查是否已经存在任何集合
// const existingCollections = await prisma.collection.findMany({
//   take: 1,
// });
// 
// if (existingCollections.length > 0) {
//   return NextResponse.json(
//     {
//       error:
//         "A collection already exists. Cannot create another collection.",
//     },
//     { status: 403 }
//   );
// }

    const body = await request.json();
    const { name, description, icon, isPublic, viewStyle, sortStyle, sortOrder } = body;
    const slug = name ? name.toLowerCase().replace(/\s+/g, '-') : "";

    // 检查名称是否已存在
    if (name) {
      const existingCollection = await prisma.collection.findFirst({
        where: {
          OR: [
            { name },
            { slug }
          ]
        }
      });

      if (existingCollection) {
        return NextResponse.json(
          { error: "The name or slug is already in use" },
          { status: 400 }
        );
      }
    }

    // 创建新集合
    const collection = await prisma.collection.create({
      data: {
        name: name || "",
        description: description || "",
        icon: icon || "",
        isPublic: isPublic ?? true,
        viewStyle: viewStyle || "list",
        sortStyle: sortStyle || "alpha",
        sortOrder: sortOrder ?? 0,
        slug,
      },
    });

    return NextResponse.json(collection);
  } catch (error: unknown) {
    console.error("Detailed error creating collection:", error);
    if (error instanceof PrismaClientKnownRequestError && error.code === 'P2002') {
      return NextResponse.json(
        { error: "Name or slug already in use" },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: `Failed to create collection: ${error instanceof Error ? error.message : 'Unknown error'}` },
      { status: 500 }
    );
  }
}
