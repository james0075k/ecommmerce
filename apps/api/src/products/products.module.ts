import { Module } from '@nestjs/common';

import { CategoriesModule } from '../categories/categories.module';
import { SearchModule } from '../search/search.module';
import { UploadModule } from '../upload/upload.module';
import { AdminProductsController } from './admin-products.controller';
import { AdminProductsService } from './admin-products.service';
import { BulkImportService } from './bulk-import.service';
import { ProductImagesService } from './product-images.service';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';
import { VariantsService } from './variants.service';

@Module({
  imports: [CategoriesModule, SearchModule, UploadModule],
  controllers: [ProductsController, AdminProductsController],
  providers: [
    ProductsService,
    AdminProductsService,
    VariantsService,
    ProductImagesService,
    BulkImportService,
  ],
  exports: [ProductsService],
})
export class ProductsModule {}
